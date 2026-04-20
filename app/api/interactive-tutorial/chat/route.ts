import OpenAI from "openai";
import { C4P_KNOWLEDGE_BASE } from "@/app/api/chat/c4p-knowledge-base";
import {
  EMIT_TUTORIAL_STEP_TOOL_NAME,
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

const EMIT_TUTORIAL_STEP_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: EMIT_TUTORIAL_STEP_TOOL_NAME,
    description:
      "Finish the assistant turn by publishing one tutorial step card (title, body, visual mode). Required once per turn after any capture_screen / show_screen_highlight rounds.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short heading for this step (like a lesson slide title).",
        },
        body: {
          type: "string",
          description: "What the user should do or understand in this step. Plain language; 1–3 short paragraphs or bullets.",
        },
        visual: {
          type: "string",
          enum: ["text", "screen", "screen_text"],
          description:
            "text = concepts only; screen = mostly pointing on screen (usually highlight); screen_text = explain while pointing (usually highlight).",
        },
      },
      required: ["title", "body", "visual"],
    },
  },
};

const TUTOR_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  CAPTURE_SCREEN_TOOL,
  SHOW_SCREEN_HIGHLIGHT_TOOL,
  EMIT_TUTORIAL_STEP_TOOL,
];

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

function sessionGoalBlock(sessionGoal: string): string {
  if (!sessionGoal.trim()) return "";
  return `\n\nSESSION GOAL (stay aligned unless the user clearly changes topic): ${sessionGoal.trim()}`;
}

function buildSystem(kind: "base" | "screenshot", sessionGoal: string): string {
  const block = sessionGoalBlock(sessionGoal);
  if (kind === "screenshot") return `${SYSTEM_WITH_SCREENSHOT}${block}`;
  return `${SYSTEM_BASE}${block}`;
}

/** Resolves client `prompt` + `intent` into the user message stored in the thread. */
function getEffectiveUserMessage(body: { prompt?: unknown; intent?: unknown; sessionGoal?: unknown }): string | null {
  const intent = body.intent === "continue_step" ? "continue_step" : "user_message";
  const sessionGoal = typeof body.sessionGoal === "string" ? body.sessionGoal.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (intent === "continue_step") {
    if (!sessionGoal) return null;
    return `[Continue] The user pressed "Next step" without a new message. Provide exactly one new step toward this goal: ${sessionGoal}`;
  }
  if (!prompt) return null;
  return prompt;
}

function tryCloseToolStream(
  toolState: StreamToolState,
  fullText: string,
  write: (obj: Record<string, unknown>) => void,
  controller: ReadableStreamDefaultController<Uint8Array>,
): boolean {
  if (!toolState.id || !toolState.name) return false;
  switch (toolState.name) {
    case "capture_screen":
      write({
        type: "done",
        action: "capture_screen",
        assistantContent: [{ type: "tool_call", id: toolState.id, name: toolState.name }],
      });
      controller.close();
      return true;
    case "show_screen_highlight": {
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
        return true;
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
      return true;
    }
    case EMIT_TUTORIAL_STEP_TOOL_NAME: {
      let title = "";
      let body = "";
      let visual = "";
      try {
        const parsed = JSON.parse(toolState.arguments || "{}") as { title?: string; body?: string; visual?: string };
        title = typeof parsed.title === "string" ? parsed.title.trim() : "";
        body = typeof parsed.body === "string" ? parsed.body.trim() : "";
        visual = typeof parsed.visual === "string" ? parsed.visual.trim() : "";
      } catch {
        /* ignore */
      }
      if (!title || !body || (visual !== "text" && visual !== "screen" && visual !== "screen_text")) {
        write({
          type: "done",
          action: null,
          reply:
            fullText.trim() ||
            "I could not read the tutorial step. Please try again — the assistant should call emit_tutorial_step with title, body, and visual.",
        });
        controller.close();
        return true;
      }
      write({
        type: "done",
        action: "tutorial_step",
        step: { title, body, visual },
        reply: fullText.trim(),
      });
      controller.close();
      return true;
    }
    default:
      return false;
  }
}

interface SharedRequestBody {
  prompt?: string;
  history?: ChatHistoryItem[];
  sessionGoal?: string;
  intent?: string;
}

function handleInitialTurn(body: SharedRequestBody): Response {
  const effective = getEffectiveUserMessage(body);
  if (!effective) {
    return Response.json({ error: "Missing prompt, or session goal for continue" }, { status: 400 });
  }

  const sessionGoal = typeof body.sessionGoal === "string" ? body.sessionGoal.trim() : "";

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...historyToMessages(body.history ?? []),
    { role: "user", content: effective },
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
          tools: TUTOR_TOOLS,
          tool_choice: "auto",
          messages: [{ role: "system", content: buildSystem("base", sessionGoal) }, ...messages],
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
          if (finish === "tool_calls" && toolState && tryCloseToolStream(toolState, fullText, write, controller)) {
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

async function handleCompleteScreenshot(
  body: SharedRequestBody & {
    imageBase64?: string | null;
    assistantContent?: unknown;
  },
): Promise<Response> {
  const effective = getEffectiveUserMessage(body);
  if (!effective) {
    return Response.json({ error: "Missing user message or session" }, { status: 400 });
  }

  const imageBase64 = normalizePngBase64(body.imageBase64);
  if (!imageBase64) return Response.json({ error: "Missing screenshot" }, { status: 400 });

  const sessionGoal = typeof body.sessionGoal === "string" ? body.sessionGoal.trim() : "";

  const assistantContent = body.assistantContent as { id?: string }[] | undefined;
  const toolCallId = assistantContent?.[0]?.id ?? "call_capture";

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...historyToMessages(body.history ?? []),
    { role: "user", content: effective },
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
      tools: TUTOR_TOOLS,
      tool_choice: "auto",
      messages: [{ role: "system", content: buildSystem("screenshot", sessionGoal) }, ...messages],
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
          if (finish === "tool_calls" && toolState && tryCloseToolStream(toolState, fullText, write, controller)) {
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

async function handleCompleteHighlight(
  body: SharedRequestBody & {
    assistantContent?: unknown;
    highlightResult?: HighlightToolResultPayload;
  },
): Promise<Response> {
  const effective = getEffectiveUserMessage(body);
  if (!effective) {
    return Response.json({ error: "Missing user message or session" }, { status: 400 });
  }

  const assistantContent = body.assistantContent as { id?: string; name?: string; arguments?: string }[] | undefined;
  const toolCallId = assistantContent?.[0]?.id ?? "call_highlight";
  const toolName = assistantContent?.[0]?.name ?? "show_screen_highlight";
  const fnArgs = assistantContent?.[0]?.arguments ?? "{}";

  const result = body.highlightResult;
  if (!result) {
    return Response.json({ error: "Missing highlightResult" }, { status: 400 });
  }

  const sessionGoal = typeof body.sessionGoal === "string" ? body.sessionGoal.trim() : "";

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
    { role: "user", content: effective },
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
      tools: TUTOR_TOOLS,
      tool_choice: "auto",
      messages: [{ role: "system", content: buildSystem("base", sessionGoal) }, ...messages],
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
          if (finish === "tool_calls" && toolState && tryCloseToolStream(toolState, fullText, write, controller)) {
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

  const shared: SharedRequestBody = {
    prompt: body.prompt as string | undefined,
    history: body.history as ChatHistoryItem[] | undefined,
    sessionGoal: body.sessionGoal as string | undefined,
    intent: body.intent as string | undefined,
  };

  const phase = body.phase;
  if (phase === "complete_screenshot") {
    return handleCompleteScreenshot({
      ...shared,
      imageBase64: body.imageBase64 as string | null | undefined,
      assistantContent: body.assistantContent,
    });
  }

  if (phase === "complete_screen_highlight") {
    return handleCompleteHighlight({
      ...shared,
      assistantContent: body.assistantContent,
      highlightResult: body.highlightResult as HighlightToolResultPayload | undefined,
    });
  }

  return handleInitialTurn(shared);
}
