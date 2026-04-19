import OpenAI from "openai";
import { C4P_KNOWLEDGE_BASE } from "@/app/api/chat/c4p-knowledge-base";
import {
  INTERACTIVE_TUTORIAL_SYSTEM_PROMPT,
  type HighlightToolResultPayload,
} from "@/lib/interactive-tutorial";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-4o";

const SYSTEM_BASE = `${INTERACTIVE_TUTORIAL_SYSTEM_PROMPT}

REFERENCE — ORGANIZATION CONTEXT (use when relevant):
${C4P_KNOWLEDGE_BASE}`;

const SYSTEM_WITH_SCREENSHOT = `${INTERACTIVE_TUTORIAL_SYSTEM_PROMPT}

The user has shared a screenshot of their screen. Use what you see to guide them precisely.

REFERENCE — ORGANIZATION CONTEXT (use when relevant):
${C4P_KNOWLEDGE_BASE}`;

interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

const CAPTURE_SCREEN_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "capture_screen",
    description:
      "Capture a screenshot of the user's current screen. Call whenever seeing their desktop, a window, or browser would help you teach the next step.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const SHOW_SCREEN_HIGHLIGHT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "show_screen_highlight",
    description:
      "Locate a UI element on the user's current screen and draw a highlight around it. Call often when directing the user to click or look somewhere. Requires target_description in English.",
    parameters: {
      type: "object",
      properties: {
        target_description: {
          type: "string",
          description:
            "English phrase describing one on-screen target for vision (e.g. 'The Google Chrome icon in the macOS Dock'). Be specific about app and region.",
        },
      },
      required: ["target_description"],
    },
  },
};

function historyToMessages(history: ChatHistoryItem[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return history.map((h) => ({ role: h.role, content: h.content }));
}

function normalizePngBase64(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^data:image\/[^;]+;base64,(.+)$/i);
  return match?.[1] ?? trimmed;
}

interface StreamToolState {
  id: string;
  name: string;
  arguments: string;
}

function mergeToolCallDelta(prev: StreamToolState | null, delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta): StreamToolState | null {
  const tc = delta.tool_calls?.[0];
  if (!tc) return prev;
  const id = tc.id ?? prev?.id ?? "";
  const name = tc.function?.name ?? prev?.name ?? "";
  const argChunk = tc.function?.arguments ?? "";
  return {
    id,
    name,
    arguments: (prev?.arguments ?? "") + argChunk,
  };
}

function handleInitialTurn(body: {
  prompt?: string;
  history?: ChatHistoryItem[];
}): Response {
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
        const stream = await client.chat.completions.create({
          model: MODEL,
          max_tokens: 8192,
          stream: true,
          tools: [CAPTURE_SCREEN_TOOL, SHOW_SCREEN_HIGHLIGHT_TOOL],
          tool_choice: "auto",
          messages: [{ role: "system", content: SYSTEM_BASE }, ...messages],
        });

        let fullText = "";
        let toolState: StreamToolState | null = null;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullText += delta.content;
            write({ type: "token", text: delta.content });
          }

          toolState = mergeToolCallDelta(toolState, delta);

          const finish = chunk.choices[0]?.finish_reason;
          if (finish === "tool_calls" && toolState?.id && toolState.name) {
            if (toolState.name === "capture_screen") {
              write({
                type: "done",
                action: "capture_screen",
                assistantContent: [{ type: "tool_call", id: toolState.id, name: toolState.name }],
              });
              controller.close();
              return;
            }
            if (toolState.name === "show_screen_highlight") {
              let targetDescription = "";
              try {
                const parsed = JSON.parse(toolState.arguments || "{}") as { target_description?: string };
                targetDescription = typeof parsed.target_description === "string" ? parsed.target_description.trim() : "";
              } catch {
                targetDescription = "";
              }
              if (!targetDescription) {
                write({
                  type: "done",
                  action: null,
                  reply:
                    fullText.trim() ||
                    "I tried to highlight something but the description was missing. Please describe what you want to find on screen.",
                });
                controller.close();
                return;
              }
              write({
                type: "done",
                action: "show_screen_highlight",
                assistantContent: [
                  {
                    type: "tool_call",
                    id: toolState.id,
                    name: toolState.name,
                    arguments: toolState.arguments,
                  },
                ],
                targetDescription,
              });
              controller.close();
              return;
            }
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
    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 8192,
      stream: true,
      tools: [CAPTURE_SCREEN_TOOL, SHOW_SCREEN_HIGHLIGHT_TOOL],
      tool_choice: "auto",
      messages: [{ role: "system", content: SYSTEM_WITH_SCREENSHOT }, ...messages],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const write = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        };

        let fullText = "";
        let toolState: StreamToolState | null = null;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullText += delta.content;
            write({ type: "token", text: delta.content });
          }

          toolState = mergeToolCallDelta(toolState, delta);

          const finish = chunk.choices[0]?.finish_reason;
          if (finish === "tool_calls" && toolState?.id && toolState.name) {
            if (toolState.name === "capture_screen") {
              write({
                type: "done",
                action: "capture_screen",
                assistantContent: [{ type: "tool_call", id: toolState.id, name: toolState.name }],
              });
              controller.close();
              return;
            }
            if (toolState.name === "show_screen_highlight") {
              let targetDescription = "";
              try {
                const parsed = JSON.parse(toolState.arguments || "{}") as { target_description?: string };
                targetDescription = typeof parsed.target_description === "string" ? parsed.target_description.trim() : "";
              } catch {
                targetDescription = "";
              }
              if (!targetDescription) {
                write({
                  type: "done",
                  action: null,
                  reply: fullText.trim() || "I could not read the highlight target. Please try again.",
                });
                controller.close();
                return;
              }
              write({
                type: "done",
                action: "show_screen_highlight",
                assistantContent: [
                  {
                    type: "tool_call",
                    id: toolState.id,
                    name: toolState.name,
                    arguments: toolState.arguments,
                  },
                ],
                targetDescription,
              });
              controller.close();
              return;
            }
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
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}

async function handleCompleteHighlight(body: {
  prompt?: string;
  history?: ChatHistoryItem[];
  assistantContent?: unknown;
  highlightResult?: HighlightToolResultPayload;
}): Promise<Response> {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });

  const assistantContent = body.assistantContent as { id?: string; name?: string; arguments?: string }[] | undefined;
  const toolCallId = assistantContent?.[0]?.id ?? "call_highlight";
  const toolName = assistantContent?.[0]?.name ?? "show_screen_highlight";
  const fnArgs = assistantContent?.[0]?.arguments ?? "{}";

  const result = body.highlightResult;
  if (!result) {
    return Response.json({ error: "Missing highlightResult" }, { status: 400 });
  }

  const toolPayload =
    result.found === true
      ? JSON.stringify({
          found: true,
          box: result.box,
          screenshotWidth: result.screenshotWidth,
          screenshotHeight: result.screenshotHeight,
        })
      : JSON.stringify({ found: false, explanation: result.explanation });

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
          function: { name: toolName, arguments: fnArgs },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: toolCallId,
      content: toolPayload,
    },
  ];

  try {
    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 8192,
      stream: true,
      tools: [CAPTURE_SCREEN_TOOL, SHOW_SCREEN_HIGHLIGHT_TOOL],
      tool_choice: "auto",
      messages: [{ role: "system", content: SYSTEM_BASE }, ...messages],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const write = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        };

        let fullText = "";
        let toolState: StreamToolState | null = null;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullText += delta.content;
            write({ type: "token", text: delta.content });
          }

          toolState = mergeToolCallDelta(toolState, delta);

          const finish = chunk.choices[0]?.finish_reason;
          if (finish === "tool_calls" && toolState?.id && toolState.name) {
            if (toolState.name === "capture_screen") {
              write({
                type: "done",
                action: "capture_screen",
                assistantContent: [{ type: "tool_call", id: toolState.id, name: toolState.name }],
              });
              controller.close();
              return;
            }
            if (toolState.name === "show_screen_highlight") {
              let targetDescription = "";
              try {
                const parsed = JSON.parse(toolState.arguments || "{}") as { target_description?: string };
                targetDescription = typeof parsed.target_description === "string" ? parsed.target_description.trim() : "";
              } catch {
                targetDescription = "";
              }
              if (!targetDescription) {
                write({ type: "done", action: null, reply: fullText.trim() || "Missing highlight target." });
                controller.close();
                return;
              }
              write({
                type: "done",
                action: "show_screen_highlight",
                assistantContent: [
                  {
                    type: "tool_call",
                    id: toolState.id,
                    name: toolState.name,
                    arguments: toolState.arguments,
                  },
                ],
                targetDescription,
              });
              controller.close();
              return;
            }
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
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
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
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      {
        error:
          "Interactive tutorial chat requires OPENAI_API_KEY. Add it to .env and restart the dev server.",
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

  const phase = body.phase;
  if (phase === "complete_screenshot") {
    return handleCompleteScreenshot({
      prompt: body.prompt as string | undefined,
      history: body.history as ChatHistoryItem[] | undefined,
      imageBase64: body.imageBase64 as string | null | undefined,
      assistantContent: body.assistantContent,
    });
  }

  if (phase === "complete_screen_highlight") {
    return handleCompleteHighlight({
      prompt: body.prompt as string | undefined,
      history: body.history as ChatHistoryItem[] | undefined,
      assistantContent: body.assistantContent,
      highlightResult: body.highlightResult as HighlightToolResultPayload | undefined,
    });
  }

  return handleInitialTurn(body as { prompt?: string; history?: ChatHistoryItem[] });
}

