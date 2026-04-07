"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import {
  captureScreenToPngBase64,
  downscalePngBase64ForAnthropicVision,
  mapAnthropicVisionBoxToCaptureSpace,
} from "@/lib/electron-screen-capture";
import {
  isVisionDebugEnabled,
  pushVisionDebugLog,
  resetVisionDebug,
  setVisionDebug,
} from "@/lib/vision-debug";
import { applyVisionGridToPngBase64 } from "@/lib/vision-grid-overlay";

/** Vision / overlay box: top-left (x,y) plus size in screenshot pixels. */
export interface Coordinates {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface ScreenshotButtonProps {
  onCoordinates?: (coords: Coordinates) => void;
  onScreenshot?: (base64: string) => void;
}

export default function ScreenshotButton({ onCoordinates, onScreenshot }: ScreenshotButtonProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"idle" | "capturing" | "analyzing">("idle");

  async function takeScreenshot() {
    if (!window.electronAPI) {
      console.error("electronAPI not available — is the app running in Electron?");
      return;
    }

    try {
      setStatus("capturing");

      const cap = await captureScreenToPngBase64();
      if (!cap) return;

      if (onScreenshot) {
        onScreenshot(cap.base64);
      } else if (onCoordinates) {
        setStatus("analyzing");

        const forApi = await downscalePngBase64ForAnthropicVision(cap);
        const gridded = await applyVisionGridToPngBase64(forApi, "full");
        if (isVisionDebugEnabled()) {
          resetVisionDebug();
          setVisionDebug({
            phase: "simple-full",
            detail: "Screenshot button → full-frame",
            lastApiImage: {
              base64: gridded.base64,
              w: gridded.width,
              h: gridded.height,
              kind: "full",
            },
            fullCapture: { base64: cap.base64, w: cap.width, h: cap.height },
            activeTileRect: null,
            tileLabel: "",
            tileIndex: 0,
            tileTotal: 0,
            lastClipHint: null,
            log: [],
          });
          pushVisionDebugLog("screenshot-button analyzeScreenshot");
        }
        const result = await window.electronAPI.analyzeScreenshot(
          gridded.base64,
          undefined,
          gridded.width,
          gridded.height,
        );
        if (result.success && result.data) {
          onCoordinates(
            mapAnthropicVisionBoxToCaptureSpace(result.data, forApi.scaleToOriginalX, forApi.scaleToOriginalY),
          );
        } else {
          throw new Error(result.error ?? "Unknown analysis error");
        }
      }
    } catch (err) {
      console.error("Screenshot failed:", err);
    } finally {
      setStatus("idle");
    }
  }

  const label = status === "capturing" ? "Capturing..." : status === "analyzing" ? "Analyzing..." : "Take Picture";

  return (
    <Button id="picButton" onClick={takeScreenshot}>
      {t("misc.takePicture")}
    </Button>
  );
}