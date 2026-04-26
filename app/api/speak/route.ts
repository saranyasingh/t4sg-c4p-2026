import OpenAI from "openai";

const MAX_INPUT_CHARS = 4096;

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      {
        error:
          "Text-to-speech requires OPENAI_API_KEY (Anthropic does not provide TTS). Add it to your .env or disable audio mode.",
      },
      { status: 503 },
    );
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

  const model = process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts";
  const voice = process.env.OPENAI_TTS_VOICE?.trim() || "marin";

  async function synthesize(m: string, v: string) {
    const speech = await client.audio.speech.create({
      model: m,
      voice: v,
      input: text,
      response_format: "mp3",
    });
    return new Uint8Array(await speech.arrayBuffer());
  }

  try {
    let bytes: Uint8Array;
    try {
      bytes = await synthesize(model, voice);
    } catch (primaryErr) {
      // Newer models/voices may be unavailable for some keys; tts-1 is widely supported.
      if (model === "tts-1" && voice === "nova") {
        throw primaryErr;
      }
      console.warn("speak route: primary TTS failed, retrying with tts-1/nova:", primaryErr);
      bytes = await synthesize("tts-1", "nova");
    }

    return new Response(bytes as unknown as BodyInit, {
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
