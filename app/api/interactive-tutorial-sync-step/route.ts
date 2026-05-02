import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

const SYNC_SYSTEM_PROMPT = `You fix interactive tutorial steps when they no longer match what is on the user's screen.

You will receive:
- A screenshot of the user's desktop
- The tutorial goal (original request)
- The current step text/metadata that failed to align with the screen
- Optional notes from an automated locator (why highlighting failed)

Your job: return exactly ONE replacement tutorial step JSON that matches what you SEE in the screenshot and tells the user the correct next action from where they actually are.

## Output format
Return exactly one JSON object in a TEXT block:
{
  "id": "it-<short>",
  "titleRaw": "Short title (<= 8 words)",
  "textRaw": "Friendly instructions (2-5 short sentences).",
  "visual": "text" | "screen" | "screen_text",
  "highlightDescription": "English phrase describing the on-screen target (Chrome icon, button label, field, etc.)"
}

Tutorial chrome (ignore for targets): the small lesson card, the slim chat box under it, the tutorial Back/Next/Exit buttons, and highlight-error banners — these are NOT the product being taught. Never aim highlights or instructions at them when the user needs in-app or browser navigation; say explicitly "app/form/browser back" vs tutorial buttons.

Rules:
- Prefer visual "screen" or "screen_text" whenever there is an on-screen target. Err on the side of including highlightDescription.
- highlightDescription must name something clearly visible in the screenshot (label, color, position).
- highlightDescription is the ONE AND ONLY targeting field. The Claude Computer Use API uses it to locate the element and draw an arrow. Do not emit any other targeting key — only the JSON shape shown above is understood by the client.
- Reuse the same "id" when the step is still the same beat; otherwise pick a new id with prefix it-.
- Third grade reading level.
- Do NOT call tools. Output JSON only.`;

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
      system: SYNC_SYSTEM_PROMPT,
      messages: messagesRaw,
    });

    return Response.json({ model: MODEL, content: msg.content }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    console.error("/api/interactive-tutorial-sync-step failed:", err);
    return Response.json({ error: message }, { status: 502 });
  }
}
