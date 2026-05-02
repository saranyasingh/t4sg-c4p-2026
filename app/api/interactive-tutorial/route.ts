import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import {
  anthropicClientErrorStatus,
  sanitizeInteractiveTutorialMessagesDeep,
} from "@/lib/interactive-tutorial-messages";

export const runtime = "nodejs";

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

  // Highlight something on the user's full screen (Chrome icon, button, field, etc.):
  "highlightDescription": "English phrase describing the target on the user's screen"
}

## Tutorial chrome (critical)
Desktop screenshots include **tutorial overlays** drawn by this assistant app — NOT part of the product being taught:
- **Lesson card:** small panel with the step title and paragraph instructions.
- **Chat box:** a slim text input that sits under the lesson card so the user can ask follow-ups.
- **Tutorial navigation bar:** row of buttons (typically Back / Next / Exit). Back/Next only move between **tutorial steps**; they do **not** navigate the underlying website or form unless explicitly stated as coincidentally similar.

**You MUST:**
- Never tell the user to tap **tutorial** Back / Next / Exit when they need **in-app** navigation (e.g. returning to a prior **form page**, browser back, or an **application** "Previous" / arrow control). Disambiguate in plain language: e.g. "use the **app's** back control / **browser** back / **form's** Previous link" — **not** "the Back button at the bottom-left" if that refers to tutorial chrome.
- Never aim highlightDescription at the lesson card, the chat box under it, the highlight-error toast, or the tutorial Back/Next/Exit buttons.
- When describing "Back", specify **which** Back you mean if both could exist.

Rules:
- Always include: id, titleRaw, textRaw, visual.
- Only include highlightDescription when the step is asking the user to find/click/type something specific. If the user is just chatting (e.g. "como estas"), use visual:"text" and DO NOT include highlightDescription.
- Keep language simple (3rd grade reading level).

## Pointer / screen targeting (Claude Computer Use API ONLY)
The only way to point at something on the user's screen is by including \`highlightDescription\` and setting \`visual\` to "screen" or "screen_text". Emitting \`highlightDescription\` triggers the Claude Computer Use API, which looks at the screenshot, locates the target, and animates an arrow pointing at it.

\`highlightDescription\` is the ONE AND ONLY targeting field. The step JSON shape above lists every key the client understands; do not emit any other key.

You MUST err on the side of including \`highlightDescription\` whenever it is even a LITTLE possible that it could help.
- If there is ANY ambiguity about where something is, include highlightDescription.
- If the step involves clicking, typing, selecting, opening, finding, looking at, or checking something on the screen — include highlightDescription.
- If the user might be looking at their desktop, the browser, or another app, include highlightDescription.
- If you are not 100% sure exactly what the target looks like, STILL include your best guess. The pointer system handles "not found" gracefully on its own.
- Generate the target description yourself based on the step. Make it specific and visual: name, label text, icon shape, color, position ("top right of the Chrome window", "below the To field", etc.).
- When you include highlightDescription, set \`visual\` to "screen" or "screen_text" (not "text").

Do NOT call any tools. There are no tools available — emit step JSON only.

## NEXT click + screenshot (do not skip unresolved steps)
Sometimes the user message includes **CURRENT STEP** (JSON) plus **The user clicked NEXT** and a **screenshot**.

When that happens you MUST gate progress:
1. Use the screenshot to decide whether the user is actually on the right screen / UI state for **CURRENT STEP** (correct app, window, page, and area).
2. If they are **NOT** ready yet, **do not advance the tutorial narrative.** Return exactly ONE step JSON that **reuses the SAME "id" as CURRENT STEP’s id**. Rewrite titleRaw, textRaw, visual, and highlights so you **only** guide them to the correct place or action so their screen matches what CURRENT STEP requires.
3. If they **ARE** ready (screen matches CURRENT STEP), return exactly ONE **new** step JSON that continues toward the goal. You **MUST** use a **brand-new id** (never reuse CURRENT STEP’s id). That new step is the true “next” lesson beat.

This gate does not apply to turns that are only chat questions from the user without NEXT+CURRENT STEP context.

## User chat mid-tutorial (NOT Next — screenshot + user question)
Sometimes the user typed a **follow-up question** during the tutorial. The message includes **User question**, optional **CURRENT OFFICIAL STEP** (JSON narrative context), and usually a **screenshot**.

Hard rules:
1. **Screenshot wins.** Treat the screenshot as the ground truth for what page/screen/dialog is visible. If it disagrees with CURRENT OFFICIAL STEP or chat history, believe the screenshot.
2. **Honor the user's intent first.** Your ONE step must help them do what they asked (undo a mistake, go back, fix a prior field, find a control, etc.).
3. **Wrong screen for their request:** If they need work done on another screen than what the screenshot shows (e.g. they want to fix their name but the UI shows a later step like birthday), you MUST output guidance that gets them **there first**: Back button, “Previous”, edit links, breadcrumbs, reopening a section—whatever fits that product. Do **not** give instructions to edit fields that are not visible. Do **not** pivot to completing the visible page’s next fields just because that page is open.
4. **Right screen:** When the screenshot shows they can complete the request on this screen, give concrete tap/type/clear steps.
5. Still output exactly **one** tutorial step JSON (not a chat essay). Use pointers when helpful.

## Conversation control
- Mid-tutorial questions are ONE-STEP detours guided by the rules above (screenshot + user intent + navigation when needed).
- When the user later clicks Next, resume forward progress toward the original goal.
- Do not dump a multi-step mini-tutorial in one response.
`;

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

    const messagesSanitized = sanitizeInteractiveTutorialMessagesDeep(messagesRaw);

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messagesSanitized,
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
    console.error("/api/interactive-tutorial failed:", err);
    const clientErr = anthropicClientErrorStatus(err);
    const status = typeof clientErr === "number" ? clientErr : 502;
    return Response.json(
      {
        error: message,
        hint:
          status === 502
            ? "Check server logs for the full error. Common causes: missing/invalid ANTHROPIC_API_KEY, model name not available, or request payload too large."
            : "Invalid request to the model (e.g. message history). The client may retry after sanitizing tool_use/tool_result pairs.",
      },
      { status },
    );
  }
}

