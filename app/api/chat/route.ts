import { C4P_KNOWLEDGE_BASE } from "./c4p-knowledge-base";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export const runtime = "nodejs";

type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

type AnthropicTextBlock = { type: "text"; text: string };

type AnthropicAssistantContentBlock = AnthropicToolUseBlock | AnthropicTextBlock;

// Prefer env override; fall back to a current model.
const CHAT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

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

const CAPTURE_SCREEN_TOOL: {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[] };
} = {
  name: "capture_screen",
  description:
    "Capture a screenshot of the user's current screen. Call this when seeing their desktop, a specific window, an error message, or browser would help you answer. Do not call for questions fully answered from the knowledge base. Do not ask the user to press a manual screenshot button.",
  input_schema: { type: "object", properties: {}, required: [] },
};

function historyToMessages(history: ChatHistoryItem[]) {
  return history
    .filter((h) => h.role === "user" || h.role === "assistant")
    .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));
}

function normalizePngBase64(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^data:image\/[^;]+;base64,(.+)$/i);
  return match?.[1] ?? trimmed;
}

async function handleInitialTurn(body: {
  prompt?: string;
  history?: ChatHistoryItem[];
  streaming?: boolean;
}): Promise<Response> {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });
  const messages: MessageParam[] = [
    ...(historyToMessages(body.history ?? []) as MessageParam[]),
    { role: "user", content: prompt },
  ];

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const write = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const stream = client.messages.stream({
          model: CHAT_MODEL,
          max_tokens: 2048,
          system: SYSTEM_BASE,
          tools: [CAPTURE_SCREEN_TOOL],
          messages,
        });

        let fullText = "";
        let toolUse: AnthropicToolUseBlock | null = null;

        stream.on("text", (delta) => {
          if (!delta) return;
          fullText += delta;
          write({ type: "token", text: delta });
        });

        stream.on("contentBlock", (block: unknown) => {
          if (!block || typeof block !== "object") return;
          const b = block as { type?: unknown; name?: unknown; id?: unknown; input?: unknown };
          if (b.type === "tool_use" && b.name === "capture_screen" && typeof b.id === "string") {
            toolUse = { type: "tool_use", id: b.id, name: "capture_screen", input: b.input };
          }
        });

        const finalMessage = await stream.finalMessage();

        if (toolUse) {
          write({
            type: "done",
            action: "capture_screen",
            assistantContent: [toolUse],
          });
          controller.close();
          return;
        }

        const reply = Array.isArray(finalMessage?.content)
          ? finalMessage.content
              .map((b: unknown) => {
                if (!b || typeof b !== "object") return "";
                const bb = b as { type?: unknown; text?: unknown };
                return bb.type === "text" && typeof bb.text === "string" ? bb.text : "";
              })
              .join("")
              .trim()
          : fullText.trim();

        write({ type: "done", action: null, reply: reply || fullText.trim() });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Request failed";
        write({ type: "error", error: message });
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

  try {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const assistantBlocks = Array.isArray(body.assistantContent) ? (body.assistantContent as unknown[]) : [];
          const toolUse = assistantBlocks.find((b) => {
            if (!b || typeof b !== "object") return false;
            const bb = b as Record<string, unknown>;
            return bb.type === "tool_use" && bb.name === "capture_screen" && typeof bb.id === "string";
          }) as { id?: string } | undefined;

          const toolUseId = toolUse?.id ?? "toolu_capture_screen";

          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

          const stream = client.messages.stream({
            model: CHAT_MODEL,
            max_tokens: 2048,
            system: SYSTEM_WITH_SCREENSHOT,
            messages: [
              ...historyToMessages(body.history ?? []),
              { role: "user", content: prompt },
              {
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    id: toolUseId,
                    name: "capture_screen",
                    input: {},
                  },
                ],
              },
              {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: toolUseId,
                    content: "Screenshot captured successfully.",
                  },
                  {
                    type: "image",
                    source: { type: "base64", media_type: "image/png", data: imageBase64 },
                  },
                  { type: "text", text: "Current screenshot of the user's screen." },
                ],
              },
            ],
          });

          stream.on("text", (delta) => {
            if (delta) controller.enqueue(encoder.encode(delta));
          });

          await stream.finalMessage();
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Request failed";
          controller.enqueue(encoder.encode(`\n\n[error] ${message}`));
          controller.close();
        }
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
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "/api/chat: ANTHROPIC_API_KEY is missing. Put .env in t4sg-c4p-2026 (same folder as package.json), not only the parent folder.",
    );
    return Response.json(
      {
        error:
          "The assistant is not set up yet. Please ask your administrator to configure the API key and restart the app.",
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
