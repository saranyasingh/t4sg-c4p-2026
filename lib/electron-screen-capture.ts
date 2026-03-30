declare global {
  interface Window {
    electronAPI?: {
      requestScreenshotPermission: () => Promise<boolean>;
      getScreenSources: () => Promise<{ id: string; name: string }[]>;
      getPrimaryScreenMediaSourceId: () => Promise<string | null>;
      getWindowContentBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
      getPrimaryDisplayBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
      analyzeScreenshot: (
        base64: string,
        targetDescription?: string,
        imageWidth?: number,
        imageHeight?: number,
      ) => Promise<{
        success: boolean;
        data?: { x: number; y: number; width: number; height: number; confidence: number };
        error?: string;
      }>;
      analyzeScreenshotTile: (
        base64: string,
        targetDescription?: string,
        imageWidth?: number,
        imageHeight?: number,
      ) => Promise<{
        success: boolean;
        found: boolean;
        data?: { x: number; y: number; width: number; height: number; confidence: number };
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

/** Anthropic downscales images when the long edge exceeds ~1568px; coords must match the bitmap we send. */
const ANTHROPIC_VISION_MAX_LONG_EDGE = 1568;

/**
 * Resize so the long edge is at most {@link ANTHROPIC_VISION_MAX_LONG_EDGE}.
 * Call the vision API with the returned dimensions, then multiply coordinates by `scaleToOriginal`.
 */
export async function downscalePngBase64ForAnthropicVision(cap: {
  base64: string;
  width: number;
  height: number;
}): Promise<{
  base64: string;
  width: number;
  height: number;
  /** Multiply API x, width by this to map back to `cap` pixel space */
  scaleToOriginalX: number;
  /** Multiply API y, height by this to map back to `cap` pixel space */
  scaleToOriginalY: number;
}> {
  const long = Math.max(cap.width, cap.height);
  if (long <= ANTHROPIC_VISION_MAX_LONG_EDGE) {
    return {
      base64: cap.base64,
      width: cap.width,
      height: cap.height,
      scaleToOriginalX: 1,
      scaleToOriginalY: 1,
    };
  }

  const factor = ANTHROPIC_VISION_MAX_LONG_EDGE / long;
  const nw = Math.round(cap.width * factor);
  const nh = Math.round(cap.height * factor);

  const img = new Image();
  const url = `data:image/png;base64,${cap.base64}`;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to decode screenshot for vision downscale"));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;
  canvas.getContext("2d")?.drawImage(img, 0, 0, nw, nh);
  const base64 = canvas.toDataURL("image/png").split(",")[1]!;

  return {
    base64,
    width: nw,
    height: nh,
    scaleToOriginalX: cap.width / nw,
    scaleToOriginalY: cap.height / nh,
  };
}

export function mapAnthropicVisionBoxToCaptureSpace(
  box: { x: number; y: number; width: number; height: number; confidence?: number },
  scaleToOriginalX: number,
  scaleToOriginalY: number,
): { x: number; y: number; width: number; height: number; confidence: number } {
  return {
    x: box.x * scaleToOriginalX,
    y: box.y * scaleToOriginalY,
    width: box.width * scaleToOriginalX,
    height: box.height * scaleToOriginalY,
    confidence: box.confidence ?? 0,
  };
}
