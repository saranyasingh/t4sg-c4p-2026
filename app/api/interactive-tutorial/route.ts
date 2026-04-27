import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export const runtime = "nodejs";

type ClientToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

// Prefer env override; fall back to a current model.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

const SYSTEM_PROMPT = `You are an interactive tutorial generator embedded in a desktop helper app.

Your job is to lead the user through a step-by-step tutorial INSIDE THIS APP and their computer.

You must generate ONE tutorial step at a time.

## Step format (return exactly one JSON object)
Return exactly one JSON object in a TEXT block, with this shape:
{
  "id": "it-<short>",
  "titleRaw": "Short title (<= 8 words)",
  "textRaw": "Friendly step instructions (2-5 short sentences).",
  "visual": "text" | "screen" | "screen_text",

  // Prefer highlighting in-app elements using a CSS selector:
  "highlightSelector": "[data-intro='chat-input']",

  // OR (only if needed) highlight something on the user's full screen:
  "highlightDescription": "English phrase describing the target on the user's screen"
}

Rules:
- Always include: id, titleRaw, textRaw, visual.
- Only include highlightSelector / highlightDescription when the step is asking the user to find/click/type something specific. If the user is just chatting (e.g. “como estas”), use visual:"text" and DO NOT include any highlight fields.
- Use highlightSelector whenever the target is inside the app panel (preferred).
- Use highlightDescription only when the target is outside the app (e.g. Chrome icon).
- Keep language simple (3rd grade reading level).

## Tool: bounding_boxes (use it a lot)
You can call the tool \`bounding_boxes\` to check if selectors exist and where they are.
Tool input:
{ "selectors": ["CSS_SELECTOR_1", "CSS_SELECTOR_2", "..."] }

Tool output is JSON text with an array of boxes:
{ "boxes": [ { "selector": "...", "found": true|false, "left": number, "top": number, "width": number, "height": number } ] }

Use it to:
- Try a few candidate selectors
- Pick the best selector that exists (found:true)
- Then output the step using highlightSelector set to that selector

Hard requirement:
- If you decide to include highlightSelector in the step JSON, you MUST first call bounding_boxes with 2-6 candidate selectors and then choose a selector that returned found:true. If none are found, omit highlightSelector.

Additional guidance for on-screen indicators:
- If the step is about something OUTSIDE the app panel (Chrome icon, browser address bar, Gmail button, etc.), set visual:"screen" or "screen_text" and include highlightDescription with a clear English description of the target. This will trigger an on-screen pointer/indicator.
- For “where is X on my screen?” questions, prefer using highlightDescription (and set visual accordingly) instead of a purely text step.
- Never include highlightDescription unless you actually want the on-screen pointer indicator.

## Conversation control
- If the user asks a question, answer briefly inside the step text, then continue the tutorial.
- Keep forward progress: do not generate a whole tutorial at once.
`;

const BOUNDING_BOXES_TOOL: {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[] };
} = {
  name: "bounding_boxes",
  description:
    "Return bounding boxes for CSS selectors in the app UI. Use this to confirm selectors exist and choose the best highlightSelector.",
  input_schema: {
    type: "object",
    properties: {
      selectors: { type: "array", items: { type: "string" }, minItems: 1 },
    },
    required: ["selectors"],
  },
};

function isMessageParamArray(v: unknown): v is MessageParam[] {
  return Array.isArray(v);
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "The assistant is not set up yet. Please ask your administrator to configure the API key and restart the app.",
      },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const messagesRaw = record.messages;
  if (!isMessageParamArray(messagesRaw)) {
    return Response.json({ error: "Missing messages[] (Anthropic MessageParam array)" }, { status: 400 });
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [BOUNDING_BOXES_TOOL],
      messages: messagesRaw,
    });

    // Return full content so the client can handle tool_use loops.
    return Response.json(
      {
        model: MODEL,
        content: msg.content,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}

