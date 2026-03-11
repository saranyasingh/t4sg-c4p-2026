"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

declare global {
  interface Window {
    electronAPI: {
      requestScreenshotPermission: () => Promise<boolean>;
      getScreenSources: () => Promise<{ id: string; name: string }[]>;
      analyzeScreenshot: (base64: string) => Promise<{
        success: boolean;
        data?: { x: number; y: number; width: number; height: number; confidence: number };
        error?: string;
      }>;
    };
  }
}

export interface Coordinates {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface ScreenshotButtonProps {
  onCoordinates: (coords: Coordinates) => void;
}

export default function ScreenshotButton({ onCoordinates }: ScreenshotButtonProps) {
  const [status, setStatus] = useState<"idle" | "capturing" | "analyzing">("idle");

  async function takeScreenshot() {
    if (!window.electronAPI) {
      console.error("electronAPI not available — is the app running in Electron?");
      return;
    }

    try {
      const allowed = await window.electronAPI.requestScreenshotPermission();
      if (!allowed) return;

      setStatus("capturing");

      const sources = await window.electronAPI.getScreenSources();
      const screen = sources[0];
      if (!screen) throw new Error("No screen source found");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: screen.id,
          },
        } as unknown as MediaTrackConstraints,
      });

      const video = document.createElement("video");
      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        video.addEventListener("loadedmetadata", () => resolve());
      });
      await video.play();

      const canvas = document.createElement("canvas");
      console.log("Video dimensions:", video.videoWidth, video.videoHeight);
      const dpr = window.devicePixelRatio ?? 1;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      stream.getTracks().forEach((track) => track.stop());

      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      console.log("Blob size:", blob.size);
      console.log("Base64 length:", base64.length);
      console.log("Canvas dimensions:", canvas.width, canvas.height);

      const link = document.createElement("a");
      link.download = "canvas-screenshot.png";
      link.href = canvas.toDataURL("image/png");
      link.click();

      setStatus("analyzing");

      const result = await window.electronAPI.analyzeScreenshot(base64);
      if (result.success && result.data) {
        onCoordinates(result.data);
      } else {
        throw new Error(result.error ?? "Unknown analysis error");
      }
    } catch (err) {
      console.error("Screenshot failed:", err);
    } finally {
      setStatus("idle");
    }
  }

  const label = status === "capturing" ? "Capturing..." : status === "analyzing" ? "Analyzing..." : "Take Picture";

  return (
    <Button id="picButton" onClick={takeScreenshot} disabled={status !== "idle"}>
      {label}
    </Button>
  );
}
