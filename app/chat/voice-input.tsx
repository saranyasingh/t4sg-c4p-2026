"use client";

import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import { useRef, useState } from "react";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  disabled?: boolean;
  onRecordingStart?: () => void;
}

type State = "idle" | "recording";

const CHUNK_INTERVAL_MS = 1500;

function getSupportedMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

async function transcribeBlob(blob: Blob, mimeType: string): Promise<string> {
  if (blob.size < 1000) return "";
  const formData = new FormData();
  // Always send as a complete file with the right extension
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
  formData.append("audio", blob, `recording.${ext}`);
  const res = await fetch("/api/transcribe", { method: "POST", body: formData });
  if (!res.ok) throw new Error("Transcription failed");
  const { transcript } = (await res.json()) as { transcript: string };
  return transcript?.trim() ?? "";
}

export function VoiceInput({ onTranscript, onInterimTranscript, disabled, onRecordingStart }: VoiceInputProps) {
  const [state, setState] = useState<State>("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const allChunksRef = useRef<Blob[]>([]); // every chunk since recording started
  const lastTranscribedIndexRef = useRef(0); // how many chunks were in last transcription
  const accumulatedRef = useRef("");
  const mimeTypeRef = useRef("");
  const isTranscribingRef = useRef(false);

  async function transcribeLatestChunks() {
    if (isTranscribingRef.current) return;
    const chunks = allChunksRef.current;
    if (chunks.length <= lastTranscribedIndexRef.current) return;

    isTranscribingRef.current = true;

    // Send ALL chunks so far — gives Whisper a complete, valid file with headers
    const blob = new Blob(chunks, { type: mimeTypeRef.current });

    try {
      const fullText = await transcribeBlob(blob, mimeTypeRef.current);
      if (fullText) {
        accumulatedRef.current = fullText; // Whisper re-transcribes the whole thing, so just replace
        onInterimTranscript?.(fullText);
      }
      lastTranscribedIndexRef.current = chunks.length;
    } catch (err) {
      console.error("Interim transcription error:", err);
    } finally {
      isTranscribingRef.current = false;
    }
  }

  async function startRecording() {
    onRecordingStart?.();
    allChunksRef.current = [];
    lastTranscribedIndexRef.current = 0;
    accumulatedRef.current = "";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      // Collect chunks every 250ms — small pieces, always append to allChunks
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) allChunksRef.current.push(e.data);
      };

      recorder.start(250);
      setState("recording");

      // Every CHUNK_INTERVAL_MS, transcribe everything collected so far
      intervalRef.current = setInterval(() => {
        void transcribeLatestChunks();
      }, CHUNK_INTERVAL_MS);
    } catch (err) {
      console.error("Microphone error:", err);
      setState("idle");
    }
  }

  async function stopRecording() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    return new Promise<void>((resolve) => {
      recorder.addEventListener("stop", async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;

        // Transcribe the complete recording
        const blob = new Blob(allChunksRef.current, { type: mimeTypeRef.current });

        try {
          const text = await transcribeBlob(blob, mimeTypeRef.current);
          if (text) onTranscript(text);
          else if (accumulatedRef.current) onTranscript(accumulatedRef.current);
        } catch (err) {
          console.error("Final transcription error:", err);
          if (accumulatedRef.current) onTranscript(accumulatedRef.current);
        }

        allChunksRef.current = [];
        accumulatedRef.current = "";
        setState("idle");
        resolve();
      });

      recorder.stop();
    });
  }

  function handleClick() {
    if (state === "recording") {
      void stopRecording();
    } else if (state === "idle") {
      void startRecording();
    }
  }

  const isRecording = state === "recording";

  return (
    <Button
      type="button"
      variant={isRecording ? "default" : "outline"}
      size="icon"
      disabled={disabled}
      onClick={handleClick}
      aria-label={isRecording ? "Stop recording" : "Start voice input"}
      className={`interactable relative shrink-0 ${isRecording ? "ring-2 ring-red-400/60" : ""}`}
    >
      {isRecording ? (
        <>
          <span className="absolute inset-0 animate-ping rounded-md bg-red-400/30" />
          <MicOff className="relative h-4 w-4" />
        </>
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
