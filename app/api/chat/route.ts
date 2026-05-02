import OpenAI from "openai";
import { C4P_KNOWLEDGE_BASE } from "./c4p-knowledge-base";

export const runtime = "nodejs";

const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o";

interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_BASE =
  C4P_KNOWLEDGE_BASE +
  "\n\nWhen the user asks about something on their computer and you need to see their screen, call the capture_screen function. After a screenshot is provided, use it to give specific, contextual answers. Do not ask the user to press a manual screenshot button. Keep all answers to a 3rd grade reading level.";

const SYSTEM_WITH_SCREENSHOT =
  C4P_KNOWLEDGE_BASE +
  "\n\nThe user has shared a screenshot of their screen. Use what you see to give specific answers — reference what is visible, guide step by step for computer help, and use the knowledge base for C4P questions. Keep all answers to a 3rd grade reading level.";

const CAPTURE_SCREEN_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "capture_screen",
    description:
      "Capture a screenshot of the user's current screen. Call this when seeing their desktop, a specific window, an error message, or browser would help you answer. Do not call for questions fully answered from the knowledge base. Do not ask the user to press a manual screenshot button.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

function historyToMessages(history: ChatHistoryItem[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return (history ?? []).map((h) => ({ role: h.role, content: h.content }));
}

function normalizePngBase64(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^data:image\/[^;]+;base64,(.+)$/i);
  return match?.[1] ?? trimmed;
}

/** Plain-language steps users (or local devs) can take for common OpenAI / network failures. */
function openAiFailureRecovery(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();

  if (
    m.includes("401") ||
    m.includes("incorrect api key") ||
    m.includes("invalid api key") ||
    m.includes("invalid_api_key") ||
    (m.includes("authentication") && m.includes("api key"))
  ) {
    return "Set OPENAI_API_KEY in your project .env file (same folder as package.json) to a valid key from https://platform.openai.com/api-keys , save the file, and fully restart the app or dev server.";
  }
  if (m.includes("429") || m.includes("rate limit") || m.includes("too many requests")) {
    return "OpenAI is rate-limiting requests. Wait a few minutes before trying again, send messages less often, or adjust rate limits / plan in your OpenAI account.";
  }
  if (m.includes("insufficient_quota") || (m.includes("billing") && m.includes("exceeded"))) {
    return "Your OpenAI account may need billing or credits. Open https://platform.openai.com/account/billing , confirm payment method and quota, then try again.";
  }
  if (
    m.includes("context_length") ||
    m.includes("maximum context") ||
    (m.includes("token") && m.includes("limit"))
  ) {
    return "This conversation or message is too long for the model. Clear older chat history if you can, shorten the message, or start a fresh thread and try again.";
  }
  if (
    m.includes("econnreset") ||
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("socket") ||
    m.includes("enotfound")
  ) {
    return "The app could not reach OpenAI over the network. Check your internet connection, VPN, or firewall; then try again.";
  }

  return "Wait a moment and send your message again. If it keeps failing, ask your administrator to check server logs and confirm OPENAI_API_KEY and OPENAI_MODEL in the environment.";
}

async function handleInitialTurn(body: {
  prompt?: string;
  history?: ChatHistoryItem[];
  streaming?: boolean;
}): Promise<Response> {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...historyToMessages(body.history ?? []),
    { role: "user", content: prompt },
  ];

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const write = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      try {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const stream = await client.chat.completions.create({
          model: OPENAI_MODEL,
          max_tokens: 2048,
          stream: true,
          tools: [CAPTURE_SCREEN_TOOL],
          tool_choice: "auto",
          messages: [{ role: "system", content: SYSTEM_BASE }, ...messages],
        });

        let fullText = "";
        let toolCallName = "";
        let toolCallId = "";

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullText += delta.content;
            write({ type: "token", text: delta.content });
          }

          if (delta.tool_calls?.[0]) {
            const tc = delta.tool_calls[0];
            if (tc.id) toolCallId = tc.id;
            if (tc.function?.name) toolCallName = tc.function.name;
          }

          const finish = chunk.choices[0]?.finish_reason;
          if (finish === "tool_calls" && toolCallName === "capture_screen") {
            write({
              type: "done",
              action: "capture_screen",
              assistantContent: [{ type: "tool_call", id: toolCallId, name: toolCallName }],
            });
            controller.close();
            return;
          }

          if (finish === "stop") {
            write({ type: "done", action: null, reply: fullText.trim() });
            controller.close();
            return;
          }
        }

        write({
          type: "done",
          action: null,
          reply: fullText.trim() || "I could not generate a response. Please try again.",
        });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Request failed";
        const hint = openAiFailureRecovery(err);
        write({ type: "error", error: message, hint });
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function handleCompleteScreenshot(body: {
  prompt?: string;
  history?: ChatHistoryItem[];
  imageBase64?: string | null;
  assistantContent?: unknown;
}): Promise<Response> {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });

  const imageBase64 = normalizePngBase64(body.imageBase64);
  if (!imageBase64) return Response.json({ error: "Missing screenshot" }, { status: 400 });

  // Extract tool call id from assistantContent passed back by frontend
  const assistantContent = body.assistantContent as { id?: string }[] | undefined;
  const toolCallId = assistantContent?.[0]?.id ?? "call_capture";

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...historyToMessages(body.history ?? []),
    { role: "user", content: prompt },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: toolCallId,
          type: "function",
          function: { name: "capture_screen", arguments: "{}" },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: toolCallId,
      content: "Screenshot captured successfully.",
    },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
        { type: "text", text: "Current screenshot of the user's screen." },
      ],
    },
  ];

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 2048,
      stream: true,
      messages: [{ role: "system", content: SYSTEM_WITH_SCREENSHOT }, ...messages],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return Response.json({ error: message, hint: openAiFailureRecovery(err) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    console.error("/api/chat: OPENAI_API_KEY is missing. Put it in t4sg-c4p-2026/.env (same folder as package.json).");
    return Response.json(
      {
        error:
          "The assistant is not set up yet. Please ask your administrator to configure the API key and restart the app.",
        hint: "Add OPENAI_API_KEY to the .env file in the project root, save it, and restart the dev server or desktop app so the variable is loaded.",
      },
      { status: 500 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.phase === "complete_screenshot") {
    return handleCompleteScreenshot({
      prompt: body.prompt as string | undefined,
      history: body.history as ChatHistoryItem[] | undefined,
      imageBase64: body.imageBase64 as string | null | undefined,
      assistantContent: body.assistantContent,
    });
  }

  return handleInitialTurn(body as { prompt?: string; history?: ChatHistoryItem[]; streaming?: boolean });
}
