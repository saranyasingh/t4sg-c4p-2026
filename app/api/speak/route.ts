import OpenAI from "openai";

const client = new OpenAI();

const MAX_INPUT_CHARS = 4096;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Expected a JSON object" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const raw =
    typeof record.text === "string"
      ? record.text
      : typeof record.assistantText === "string"
        ? record.assistantText
        : null;

  if (raw === null) {
    return Response.json(
      { error: "Missing string field: text (or assistantText)" },
      { status: 400 },
    );
  }

  const text = raw.trim();
  if (!text) {
    return Response.json({ error: "Text must not be empty" }, { status: 400 });
  }

  if (text.length > MAX_INPUT_CHARS) {
    return Response.json(
      { error: `Text must be at most ${MAX_INPUT_CHARS} characters` },
      { status: 400 },
    );
  }

  try {
    const speech = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "marin",
      input: text,
      response_format: "mp3",
    });

    const bytes = new Uint8Array(await speech.arrayBuffer());

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("speak route error:", err);
    return Response.json({ error: "Failed to generate speech" }, { status: 500 });
  }
}
