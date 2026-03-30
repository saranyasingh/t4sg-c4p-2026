"use client";

import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import BoundingBoxOverlay from "@/app/bounding-box-overlay";
import { useTranslation } from "react-i18next";
import type { ScreenHighlight, StepVisual } from "@/lib/tutorials";
import {
  captureScreenToPngBase64,
  downscalePngBase64ForAnthropicVision,
  mapAnthropicVisionBoxToCaptureSpace,
} from "@/lib/electron-screen-capture";
import { useEffect, useState } from "react";
import { useTutorial } from "./tutorial-provider";

function visualLabelKey(v: StepVisual): string {
  if (v === "text") return "tutorial.visualText";
  if (v === "screen") return "tutorial.visualScreen";
  return "tutorial.visualScreenText";
}

/**
 * Tutorial UI + highlight overlay. Renders inside the shell panel; bounding boxes use fixed positioning for the full window.
 */
export function TutorialController() {
  const { t } = useTranslation();
  const {
    tutorialId,
    activeTutorial,
    currentStep,
    exitTutorial,
    nextStep,
    previousStep,
    canGoNext,
    canGoPrevious,
    isLastStep,
  } = useTutorial();

  const [highlightPayload, setHighlightPayload] = useState<{
    coords: ScreenHighlight;
    screenshotWidth: number;
    screenshotHeight: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncHighlight() {
      if (!currentStep) {
        setHighlightPayload(null);
        return;
      }

      if (currentStep.highlightDescription) {
        setHighlightPayload(null);
        if (typeof window === "undefined" || !window.electronAPI) {
          return;
        }

        const cap = await captureScreenToPngBase64();
        if (cancelled || !cap) return;

        const forApi = await downscalePngBase64ForAnthropicVision(cap);
        const result = await window.electronAPI.analyzeScreenshot(
          forApi.base64,
          currentStep.highlightDescription,
          forApi.width,
          forApi.height,
        );
        if (cancelled) return;

        if (result.success && result.data) {
          const d = mapAnthropicVisionBoxToCaptureSpace(
            result.data,
            forApi.scaleToOriginalX,
            forApi.scaleToOriginalY,
          );
          setHighlightPayload({
            coords: {
              x: d.x,
              y: d.y,
              width: d.width,
              height: d.height,
              confidence: d.confidence,
            },
            screenshotWidth: cap.width,
            screenshotHeight: cap.height,
          });
        }
        return;
      }

      if (currentStep.highlight) {
        setHighlightPayload({
          coords: currentStep.highlight,
          screenshotWidth: typeof window !== "undefined" ? window.innerWidth : 1,
          screenshotHeight: typeof window !== "undefined" ? window.innerHeight : 1,
        });
        return;
      }

      setHighlightPayload(null);
    }

    void syncHighlight();
    return () => {
      cancelled = true;
    };
  }, [currentStep]);

  if (!tutorialId || !activeTutorial || !currentStep) {
    return null;
  }

  const fallbackW = typeof window !== "undefined" ? window.innerWidth : 1;
  const fallbackH = typeof window !== "undefined" ? window.innerHeight : 1;

  return (
    <>
      <BoundingBoxOverlay
        coords={highlightPayload?.coords ?? null}
        screenshotWidth={highlightPayload?.screenshotWidth ?? fallbackW}
        screenshotHeight={highlightPayload?.screenshotHeight ?? fallbackH}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end p-4">
        <div
          className="pointer-events-auto max-h-[45vh] overflow-y-auto rounded-xl border border-white/25 bg-[hsl(var(--foreground)/0.92)] p-4 text-white shadow-lg backdrop-blur-sm"
          role="dialog"
          aria-labelledby="tutorial-step-title"
          aria-describedby="tutorial-step-body"
        >
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">{activeTutorial.title}</p>
              <h2 id="tutorial-step-title" className="text-base font-semibold leading-snug text-white">
                {currentStep.title ?? activeTutorial.title}
              </h2>
            </div>
            <span
              className="shrink-0 rounded-md border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/85"
              title={t("tutorial.visualBadgeHint")}
            >
              {t(visualLabelKey(currentStep.visual))}
            </span>
          </div>
          <TypographyP id="tutorial-step-body" className="whitespace-pre-wrap text-sm leading-relaxed">
            {currentStep.text}
          </TypographyP>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {canGoPrevious ? (
              <Button type="button" variant="outline" className="interactable border-white/40" onClick={previousStep}>
                {t("tutorial.back")}
              </Button>
            ) : null}
            {canGoNext ? (
              <Button type="button" className="interactable" onClick={nextStep}>
                {t("tutorial.next")}
              </Button>
            ) : null}
            {isLastStep ? (
              <Button type="button" className="interactable" onClick={exitTutorial}>
                {t("tutorial.finish")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="interactable text-white/90 hover:bg-white/10"
              onClick={exitTutorial}
            >
              {t("tutorial.exit")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
