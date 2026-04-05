"use client";

import BoundingBoxOverlay from "@/app/bounding-box-overlay";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import { captureScreenToPngBase64 } from "@/lib/electron-screen-capture";
import { findTargetViaChunkedVision } from "@/lib/screen-chunk-pipeline";
import type { ScreenHighlight, StepVisual } from "@/lib/tutorials";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

  const [highlightError, setHighlightError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncHighlight() {
      if (!currentStep) {
        setHighlightPayload(null);
        setHighlightError(null);
        return;
      }

      if (currentStep.highlightDescription) {
        setHighlightPayload(null);
        setHighlightError(null);
        if (typeof window === "undefined" || !window.electronAPI) {
          return;
        }

        const cap = await captureScreenToPngBase64();
        if (cancelled || !cap) return;

        const result = await findTargetViaChunkedVision(cap, currentStep.highlightDescription);
        if (cancelled) return;

        if (result.found) {
          setHighlightError(null);
          setHighlightPayload({
            coords: {
              x: result.box.x,
              y: result.box.y,
              width: result.box.width,
              height: result.box.height,
              confidence: result.box.confidence,
            },
            screenshotWidth: cap.width,
            screenshotHeight: cap.height,
          });
        } else {
          setHighlightPayload(null);
          setHighlightError(result.explanation);
        }
        return;
      }

      if (currentStep.highlight) {
        setHighlightError(null);
        setHighlightPayload({
          coords: currentStep.highlight,
          screenshotWidth: typeof window !== "undefined" ? window.innerWidth : 1,
          screenshotHeight: typeof window !== "undefined" ? window.innerHeight : 1,
        });
        return;
      }

      setHighlightPayload(null);
      setHighlightError(null);
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
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                {t(activeTutorial.title)}
              </p>
              <h2 id="tutorial-step-title" className="text-base font-semibold leading-snug text-white">
                {currentStep.title ? t(currentStep.title) : t(activeTutorial.title)}
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
            {t(currentStep.text)}
          </TypographyP>

          {highlightError && (
            <div className="mt-3 rounded-lg border border-yellow-400/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
              <p className="mb-0.5 font-semibold text-yellow-300">{t("tutorial.highlightErrorTitle")}</p>
              <p className="mb-1 leading-snug">{highlightError}</p>
              <p className="text-xs text-yellow-200/90">{t("tutorial.highlightErrorHint")}</p>
            </div>
          )}

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
