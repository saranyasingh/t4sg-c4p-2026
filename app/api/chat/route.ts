import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  ContentBlockParam,
  MessageParam,
  RawMessageStreamEvent,
  TextBlock,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { C4P_KNOWLEDGE_BASE } from "./c4p-knowledge-base";

export const runtime = "nodejs";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

const CAPTURE_SCREEN_TOOL: Tool = {
  name: "capture_screen",
  description:
    "Capture a screenshot of the user's current screen. Call this when seeing their desktop, a specific window, an error message, or browser would help you answer (for example: where to click, what is on screen, or troubleshooting). Do not call for questions that are fully answered from the knowledge base without visual context. Do not ask the user to press a manual screenshot button.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

function historyToMessages(history: ChatHistoryItem[]): MessageParam[] {
  return history.map((h) => ({
    role: h.role,
    content: h.content,
  }));
}

/** Strip data-URL prefix if present so Anthropic gets raw base64. */
function normalizePngBase64(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const dataUrl = trimmed.match(/^data:image\/png;base64,(.+)$/i);
  if (dataUrl?.[1]) return dataUrl[1];
  const anyImg = trimmed.match(/^data:image\/[^;]+;base64,(.+)$/i);
  if (anyImg?.[1]) return anyImg[1];
  return trimmed;
}

function extractTextFromContent(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function parseAssistantContent(raw: unknown): ContentBlock[] | null {
  if (!Array.isArray(raw)) return null;
  return raw as ContentBlock[];
}

function wantsCaptureScreen(content: ContentBlock[]): boolean {
  return content.some((b) => b.type === "tool_use" && b.name === "capture_screen");
}

function anthropicErrorPayload(err: unknown, model: string) {
  const status =
    err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : 502;
  const message =
    err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : err instanceof Error
        ? err.message
        : "Anthropic request failed";
  console.error("/api/chat Anthropic error:", { model, status, message, err });
  const clientStatus = status >= 400 && status < 600 ? status : 502;
  const hint =
    clientStatus === 404 || /not_found|model/i.test(message)
      ? "Check ANTHROPIC_MODEL in .env matches a model your API key can use (see Anthropic docs)."
      : clientStatus === 401
        ? "Invalid or missing API key."
        : undefined;
  return { message, model, hint, clientStatus };
}

function anthropicErrorResponse(err: unknown, model: string) {
  const { message, model: m, hint, clientStatus } = anthropicErrorPayload(err, model);
  return Response.json({ error: message, model: m, hint }, { status: clientStatus });
}

function streamTextFromMessageStream(stream: AsyncIterable<RawMessageStreamEvent>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        console.error("Anthropic stream error:", err);
        controller.error(err);
      }
    },
  });
}

async function handleCompleteScreenshot(
  client: Anthropic,
  model: string,
  body: {
    prompt?: string;
    history?: ChatHistoryItem[];
    imageBase64?: string | null;
    assistantContent?: unknown;
  },
) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json({ error: "Missing or empty prompt" }, { status: 400 });
  }

  const imageBase64 = normalizePngBase64(body.imageBase64 ?? undefined);
  if (!imageBase64) {
    return Response.json({ error: "Missing or invalid screenshot image" }, { status: 400 });
  }

  const assistantContent = parseAssistantContent(body.assistantContent);
  if (!assistantContent?.length || !wantsCaptureScreen(assistantContent)) {
    return Response.json({ error: "Invalid screenshot completion request" }, { status: 400 });
  }

  const systemWithScreenshot =
    C4P_KNOWLEDGE_BASE +
    "\n\nThe user has shared a screenshot of their screen. Use what you see to give specific answers — reference what is visible, guide step by step for computer help, and use the knowledge base for C4P questions.";

  const toolResultBlocks: ContentBlockParam[] = [];
  for (const block of assistantContent) {
    if (block.type !== "tool_use") continue;
    const note =
      block.name === "capture_screen"
        ? JSON.stringify({ ok: true, note: "Screenshot is attached in this message." })
        : JSON.stringify({ ok: false, error: "Unsupported tool." });
    toolResultBlocks.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: note,
    });
  }

  const userFollowUp: ContentBlockParam[] = [
    ...toolResultBlocks,
    {
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: imageBase64,
      },
    },
    { type: "text", text: "Current screenshot of the user's screen." },
  ];

  const messages: MessageParam[] = [
    ...historyToMessages(body.history ?? []),
    { role: "user", content: prompt },
    { role: "assistant", content: assistantContent as MessageParam["content"] },
    { role: "user", content: userFollowUp },
  ];

  try {
    const stream = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemWithScreenshot,
      messages,
      stream: true,
    });

    return new Response(streamTextFromMessageStream(stream), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return anthropicErrorResponse(err, model);
  }
}

async function handleInitialTurn(
  client: Anthropic,
  model: string,
  body: { prompt?: string; history?: ChatHistoryItem[]; streaming?: boolean },
) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json({ error: "Missing or empty prompt" }, { status: 400 });
  }

  const systemBase =
    C4P_KNOWLEDGE_BASE +
    "\n\nWhen the user asks about something on their computer and you need to see their screen, call the capture_screen tool. After a screenshot is provided, use it to give specific, contextual answers. Do not ask the user to press a manual screenshot button.";

  const messages: MessageParam[] = [
    ...historyToMessages(body.history ?? []),
    { role: "user", content: prompt },
  ];

  if (body.streaming) {
    const stream = client.messages.stream({
      model,
      max_tokens: 8192,
      system: systemBase,
      messages,
      tools: [CAPTURE_SCREEN_TOOL],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const write = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        };

        stream.on("text", (delta: string) => {
          write({ type: "token", text: delta });
        });

        try {
          const final = await stream.finalMessage();
          const blocks = final.content as ContentBlock[];
          if (wantsCaptureScreen(blocks)) {
            write({ type: "done", action: "capture_screen", assistantContent: blocks });
          } else {
            const text = extractTextFromContent(blocks).trim();
            write({
              type: "done",
              action: null,
              reply: text || "I could not generate a response. Please try again.",
            });
          }
          controller.close();
        } catch (err) {
          const { message, model: m, hint } = anthropicErrorPayload(err, model);
          write({ type: "error", error: message, model: m, hint });
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

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemBase,
      messages,
      tools: [CAPTURE_SCREEN_TOOL],
    });

    const blocks = response.content;
    if (wantsCaptureScreen(blocks)) {
      return Response.json({
        action: "capture_screen" as const,
        assistantContent: blocks,
      });
    }

    const text = extractTextFromContent(blocks).trim();
    if (!text) {
      return Response.json({ reply: "I could not generate a response. Please try again." });
    }
    return Response.json({ reply: text });
  } catch (err) {
    return anthropicErrorResponse(err, model);
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
          "ANTHROPIC_API_KEY is not configured. Add it to t4sg-c4p-2026/.env and restart the dev server.",
      },
      { status: 500 },
    );
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.phase === "complete_screenshot") {
    return handleCompleteScreenshot(client, model, {
      prompt: body.prompt as string | undefined,
      history: body.history as ChatHistoryItem[] | undefined,
      imageBase64: body.imageBase64 as string | null | undefined,
      assistantContent: body.assistantContent,
    });
  }

  return handleInitialTurn(client, model, body as { prompt?: string; history?: ChatHistoryItem[]; streaming?: boolean });
}
