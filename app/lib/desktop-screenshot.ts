"use client";

export interface Coordinates {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

declare global {
  interface Window {
    electronAPI?: {
      requestScreenshotPermission: () => Promise<boolean>;
      getScreenSources: () => Promise<{ id: string; name: string }[]>;
      analyzeScreenshot: (payload: {
        base64: string;
        captureWidth: number;
        captureHeight: number;
      }) => Promise<{
        success: boolean;
        data?: Coordinates;
        error?: string;
      }>;
    };
  }
}

/**
 * Captures the primary display via Electron desktop capture. Returns PNG base64 and bitmap dimensions.
 */
export async function captureDesktopScreenshot(): Promise<{
  base64: string;
  width: number;
  height: number;
} | null> {
  if (!window.electronAPI) {
    console.error("electronAPI not available — is the app running in Electron?");
    return null;
  }

  const allowed = await window.electronAPI.requestScreenshotPermission();
  if (!allowed) return null;

  const sources = await window.electronAPI.getScreenSources();
  const screen = sources[0];
  if (!screen) {
    console.error("No screen source found");
    return null;
  }

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
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
  });
  await video.play();

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  stream.getTracks().forEach((track) => track.stop());

  const base64 = canvas.toDataURL("image/png").split(",")[1]!;
  return { base64, width: canvas.width, height: canvas.height };
}
