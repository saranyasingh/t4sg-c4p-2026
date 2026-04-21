declare global {
  interface Window {
    electronAPI?: {
      requestScreenshotPermission: () => Promise<boolean>;
      getScreenSources: () => Promise<{ id: string; name: string }[]>;
      getPrimaryScreenMediaSourceId: () => Promise<string | null>;
      getWindowContentBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
      getPrimaryDisplayBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
      /**
       * Computer Use API: returns the exact center pixel of a UI element in original screenshot pixel space.
       */
      locateElementComputerUse?: (
        base64: string,
        targetDescription?: string,
        imageWidth?: number,
        imageHeight?: number,
      ) => Promise<{
        success: boolean;
        found?: boolean;
        x?: number;
        y?: number;
        explanation?: string;
        error?: string;
      }>;
    };
  }
}

/**
 * Capture the primary desktop source as a PNG data URL payload (base64 without prefix).
 * Returns dimensions of the captured bitmap for coordinate scaling with the vision API.
 */
export async function captureScreenToPngBase64(): Promise<{
  base64: string;
  width: number;
  height: number;
} | null> {
  if (typeof window === "undefined" || !window.electronAPI) {
    console.error("electronAPI not available — is the app running in Electron?");
    return null;
  }

  const allowed = await window.electronAPI.requestScreenshotPermission();
  if (!allowed) return null;

  let mediaSourceId: string | null = null;
  if (window.electronAPI.getPrimaryScreenMediaSourceId) {
    mediaSourceId = await window.electronAPI.getPrimaryScreenMediaSourceId();
  }
  if (!mediaSourceId) {
    const sources = await window.electronAPI.getScreenSources();
    mediaSourceId = sources[0]?.id ?? null;
  }
  if (!mediaSourceId) {
    console.error("No screen source found");
    return null;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: mediaSourceId,
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
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  stream.getTracks().forEach((track) => track.stop());

  const base64 = canvas.toDataURL("image/png").split(",")[1]!;
  return { base64, width: canvas.width, height: canvas.height };
}
