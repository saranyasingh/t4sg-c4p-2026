import Anthropic from "@anthropic-ai/sdk";
import type { ImageBlockParam, MessageParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const anthropicClient = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const SYSTEM_PROMPT = `You are a friendly tutor helping someone in the middle of a tutorial about computers. You answer follow-up questions briefly and clearly.

You will receive:
- The name of the tutorial they're going through
- The CURRENT STEP they're on (a short title and body)
- A screenshot of their current screen (when available) — use it to give accurate, context-aware answers
- A question they asked

Reply with a SHORT helpful answer that addresses just their question. Use the screenshot to ground your answer in what the user actually sees. After answering, gently nudge them back to the current tutorial step if it's relevant.

Hard rules:
- Output ONE JSON object in a TEXT block, in this exact shape:
  {
    "titleRaw": "Short title for the answer (<= 8 words)",
    "textRaw": "Friendly answer body (2-4 short sentences)",
    "highlightDescription": "Visual description of an on-screen element (omit if not pointing at screen)"
  }
- Third grade reading level. Simple language.
- Do not write more than ~4 sentences total.
- Err on the side of including \`highlightDescription\` when the user asks where something is or wants you to show them a UI element (e.g. "where is the search bar?", "show me the button", "I can't find it"). Also include it when you can see the target in the screenshot and pointing to it would help. Omit the key entirely otherwise.
- When you include \`highlightDescription\`, describe the element visually and specifically based on what you see in the screenshot: its label, color, icon shape, and position (e.g. "the blue Google Search button centered below the search box").
- Do not include any other keys in the JSON.`;

interface RequestBody {
  question?: unknown;
  tutorialName?: unknown;
  currentStepTitle?: unknown;
  currentStepBody?: unknown;
  screenshotBase64?: unknown;
  screenshotMediaType?: unknown;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function extractAnswer(
  content: unknown,
): { titleRaw: string; textRaw: string; highlightDescription?: string } | null {
  if (!Array.isArray(content)) return null;
  const textBlocks = content
    .filter(
      (b) =>
        b && typeof b === "object" && (b as any).type === "text" && typeof (b as any).text === "string",
    )
    .map((b) => (b as any).text as string);
  const joined = textBlocks.join("\n").trim();
  if (!joined) return null;

  const m = joined.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as {
      titleRaw?: unknown;
      textRaw?: unknown;
      highlightDescription?: unknown;
    };
    const titleRaw = typeof parsed.titleRaw === "string" ? parsed.titleRaw : "Quick answer";
    const textRaw = typeof parsed.textRaw === "string" ? parsed.textRaw : null;
    if (!textRaw) return null;
    const highlightDescription =
      typeof parsed.highlightDescription === "string" && parsed.highlightDescription.trim()
        ? parsed.highlightDescription.trim()
        : undefined;
    return { titleRaw, textRaw, ...(highlightDescription ? { highlightDescription } : {}) };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!anthropicClient) {
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

  const record = body as RequestBody;
  const question = asString(record.question);
  if (!question) {
    return Response.json({ error: "Missing question" }, { status: 400 });
  }
  const tutorialName = asString(record.tutorialName);
  const currentStepTitle = asString(record.currentStepTitle);
  const currentStepBody = asString(record.currentStepBody);
  const screenshotBase64 = asString(record.screenshotBase64);
  const screenshotMediaType =
    typeof record.screenshotMediaType === "string" && record.screenshotMediaType.trim()
      ? (record.screenshotMediaType.trim() as "image/png" | "image/jpeg")
      : "image/png";

  const userText =
    `Tutorial they are going through: ${tutorialName ?? "(unknown)"}\n\n` +
    `CURRENT STEP they are on:\n` +
    `Title: ${currentStepTitle ?? "(none)"}\n` +
    `Body: ${currentStepBody ?? "(none)"}\n\n` +
    `Their question: ${question}\n\n` +
    `Answer in JSON exactly as instructed. If the user wants to be shown something on screen, or if you can see the target in the screenshot, include highlightDescription in the JSON.`;

  const userContent: (ImageBlockParam | TextBlockParam)[] = [];
  if (screenshotBase64) {
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: screenshotMediaType, data: screenshotBase64 },
    });
  }
  userContent.push({ type: "text", text: userText });

  const messages: MessageParam[] = [{ role: "user", content: userContent }];

  try {
    const msg = await anthropicClient.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages,
    });

    const answer = extractAnswer(msg.content);
    if (!answer) {
      return Response.json(
        { error: "The assistant did not return a usable answer. Please try again." },
        { status: 502 },
      );
    }

    return Response.json({ model: MODEL, ...answer }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    console.error("/api/tutorial-chat failed:", err);
    return Response.json({ error: message }, { status: 502 });
  }
}
