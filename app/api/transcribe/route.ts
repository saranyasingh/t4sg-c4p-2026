import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Voice transcription requires OPENAI_API_KEY (Anthropic does not provide speech-to-text). Add it to your .env or disable voice input.",
      },
      { status: 503 },
    );
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }
    const file = new File([audioFile], audioFile.name || "recording.webm", { type: audioFile.type });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      response_format: "json",
    });

    return NextResponse.json({ transcript: transcription.text });
  } catch (err) {
    console.error("Transcription error:", err);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
