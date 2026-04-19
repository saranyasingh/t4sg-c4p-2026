"use client";

import BoundingBoxOverlay from "@/app/bounding-box-overlay";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import { captureScreenToPngBase64 } from "@/lib/electron-screen-capture";
import { findTargetViaChunkedVision } from "@/lib/screen-chunk-pipeline";
import type { ScreenHighlight, StepVisual } from "@/lib/tutorials";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
    useCssCoords?: boolean;
  } | null>(null);
  const [isLoadingHighlight, setIsLoadingHighlight] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1,
    h: typeof window !== "undefined" ? window.innerHeight : 1,
  }));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function syncViewport() {
      setViewport({
        w: typeof window !== "undefined" ? window.innerWidth : 1,
        h: typeof window !== "undefined" ? window.innerHeight : 1,
      });
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  const [highlightError, setHighlightError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncHighlight() {
      if (!currentStep) {
        setHighlightPayload(null);
        setIsLoadingHighlight(false);
        setHighlightError(null);
        return;
      }

      if (currentStep.highlightDescription) {
        setHighlightPayload(null);
        setIsLoadingHighlight(true);
        setHighlightError(null);
        if (typeof window === "undefined" || !window.electronAPI) {
          setIsLoadingHighlight(false);
          setHighlightError("Screen analysis is only available in the desktop app.");
          return;
        }

        try {
          const cap = await captureScreenToPngBase64();
          if (cancelled || !cap) {
            setIsLoadingHighlight(false);
            return;
          }

          const d = await findTargetViaChunkedVision(cap, currentStep.highlightDescription);
          if (cancelled) {
            setIsLoadingHighlight(false);
            return;
          }

          if (d.found) {
            setHighlightError(null);
            setHighlightPayload({
              coords: {
                x: d.box.x,
                y: d.box.y,
                width: d.box.width,
                height: d.box.height,
                confidence: d.box.confidence,
              },
              screenshotWidth: cap.width,
              screenshotHeight: cap.height,
              useCssCoords: false,
            });
          } else {
            setHighlightPayload(null);
            setHighlightError(d.explanation);
          }
        } catch (err) {
          if (cancelled) return;
          console.error("Highlight vision failed:", err);
          setHighlightPayload(null);
          setHighlightError(
            err instanceof Error
              ? `Something went wrong while locating the target: ${err.message}`
              : "Something went wrong while locating the target on screen.",
          );
        }
        setIsLoadingHighlight(false);
        return;
      }

      if (currentStep.highlight) {
        setIsLoadingHighlight(false);
        setHighlightError(null);
        setHighlightPayload({
          coords: currentStep.highlight,
          screenshotWidth: typeof window !== "undefined" ? window.innerWidth : 1,
          screenshotHeight: typeof window !== "undefined" ? window.innerHeight : 1,
          useCssCoords: false,
        });
        return;
      }

      if (currentStep.highlightSelector) {
        // Measurement is handled in a dedicated effect below so it can respond
        // to viewport resizes without re-running the vision pipeline.
        setIsLoadingHighlight(false);
        setHighlightError(null);
        return;
      }

      setIsLoadingHighlight(false);
      setHighlightPayload(null);
      setHighlightError(null);
    }

    void syncHighlight();
    return () => {
      cancelled = true;
    };
  }, [currentStep]);

  // Selector-based highlights: keep measuring while layout/scroll changes so the
  // spotlight stays attached to the element as containers move.
  useEffect(() => {
    if (!currentStep?.highlightSelector || typeof window === "undefined") return;

    const selector = currentStep.highlightSelector;
    let rafId: number | null = null;
    const scheduleMeasure = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    };

    const measure = () => {
      // Selector can contain a comma-separated list; spotlight spans the union
      // of all matched elements (e.g. step card + a nav button together).
      const nodes = Array.from(document.querySelectorAll(selector));
      const rects = nodes
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      if (rects.length === 0) {
        setHighlightPayload(null);
        return;
      }
      const left = Math.min(...rects.map((r) => r.left));
      const top = Math.min(...rects.map((r) => r.top));
      const right = Math.max(...rects.map((r) => r.right));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const offsetX = currentStep.highlightOffsetX ?? 0;
      const offsetY = currentStep.highlightOffsetY ?? 0;
      setHighlightPayload({
        coords: {
          x: left + offsetX,
          y: top + offsetY,
          width: right - left,
          height: bottom - top,
          confidence: 1,
        },
        screenshotWidth: window.innerWidth,
        screenshotHeight: window.innerHeight,
        useCssCoords: true,
      });
    };

    measure();
    window.addEventListener("resize", scheduleMeasure);
    // Capture-phase scroll catches nested scroll containers (like chat history).
    window.addEventListener("scroll", scheduleMeasure, true);

    const resizeObserver = new ResizeObserver(() => {
      scheduleMeasure();
    });
    resizeObserver.observe(document.body);

    const mutationObserver = new MutationObserver(() => {
      scheduleMeasure();
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [currentStep]);

  const fallbackW = typeof window !== "undefined" ? window.innerWidth : 1;
  const fallbackH = typeof window !== "undefined" ? window.innerHeight : 1;

  const textBoxStyle = useMemo(() => {
    const vw = viewport.w;
    const margin = 16;
    // Always anchor the step card to the bottom-left of the screen, just above the
    // Back/Next/Exit tutorial controls. This keeps the app panel fully visible and
    // places all tutorial UI in a consistent, predictable spot.
    const cardW = Math.min(420, Math.max(240, vw - margin * 2));
    return {
      width: cardW,
      left: margin,
      top: undefined as number | undefined,
      bottom: 64,
    };
  }, [viewport.w]);

  if (!mounted || !tutorialId || !activeTutorial || !currentStep) {
    return null;
  }

  const shouldWaitForBox = Boolean(currentStep.highlightDescription);
  const showStepText = !shouldWaitForBox || !isLoadingHighlight;
  const hasSpotlight = Boolean(highlightPayload?.coords);

  return (
    <>
      {!hasSpotlight && !currentStep.highlightBright
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-0"
              style={{
                zIndex: 1000001,
                background: "rgba(8, 10, 16, 0.54)",
              }}
              aria-hidden="true"
            />,
            document.body,
          )
        : null}

      <BoundingBoxOverlay
        coords={highlightPayload?.coords ?? null}
        screenshotWidth={highlightPayload?.screenshotWidth ?? fallbackW}
        screenshotHeight={highlightPayload?.screenshotHeight ?? fallbackH}
        expandFactor={currentStep.highlightExpandFactor ?? 2.1}
        minPadding={currentStep.highlightMinPadding ?? 28}
        useCssCoords={Boolean(highlightPayload?.useCssCoords)}
        brightMode={Boolean(currentStep.highlightBright)}
        onSpotlightRectChange={setSpotlightRect}
      />

      {showStepText
        ? createPortal(
            <div
              id="tutorial-step-card"
              className="pointer-events-none fixed z-[1000003] max-h-[42vh] overflow-y-auto rounded-xl border border-white/35 bg-[hsl(var(--foreground)/0.95)] p-4 text-white shadow-2xl backdrop-blur-sm"
              style={{
                left: textBoxStyle.left,
                top: textBoxStyle.top,
                bottom: textBoxStyle.bottom,
                width: textBoxStyle.width,
                maxHeight: textBoxStyle.bottom ? "calc(100vh - 96px)" : undefined,
              }}
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
            </div>,
            document.body,
          )
        : createPortal(
            <div
              className="pointer-events-none fixed inset-0 z-[1000003] flex items-center justify-center px-6"
              role="status"
              aria-live="polite"
            >
              <div className="rounded-lg border border-white/30 bg-black/70 px-4 py-2 text-sm font-medium tracking-wide text-white">
                Loading...
              </div>
            </div>,
            document.body,
          )}
        {highlightError
          ? createPortal(
              <div
                className="pointer-events-none fixed left-1/2 top-6 z-[1000004] w-[90vw] max-w-md -translate-x-1/2"
              >
                <div className="rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-600/90 via-orange-500/90 to-red-500/90 px-5 py-4 text-white shadow-2xl backdrop-blur-sm">
                  <p className="mb-1 text-sm font-bold tracking-wide">{t("tutorial.highlightErrorTitle")}</p>
                  <p className="mb-2 text-sm leading-snug">{highlightError}</p>
                  <p className="text-xs font-medium text-white/80">{t("tutorial.highlightErrorHint")}</p>
                </div>
              </div>,
              document.body,
            )
          : null}

   
      {createPortal(
        <div className="fixed bottom-4 left-4 z-[1000004] flex flex-wrap items-center gap-2">
          {canGoPrevious ? (
            <Button
              type="button"
              variant="outline"
              className="interactable border-white/40 bg-black/60 text-white"
              onClick={previousStep}
            >
              {t("tutorial.back")}
            </Button>
          ) : null}
          {canGoNext ? (
            <Button type="button" className="interactable bg-white text-black hover:bg-white/90" onClick={nextStep}>
              {t("tutorial.next")}
            </Button>
          ) : null}
          {isLastStep ? (
            <Button
              id="tutorial-finish-button"
              type="button"
              className="interactable bg-white text-black hover:bg-white/90"
              onClick={exitTutorial}
            >
              {t("tutorial.finish")}
            </Button>
          ) : null}
          {!isLastStep ? (
            <Button
              id="tutorial-exit-button"
              type="button"
              variant={currentStep.id === "intro-exit" ? "default" : "ghost"}
              data-intro="tutorial-exit"
              className={
                currentStep.id === "intro-exit"
                  ? "interactable bg-white text-black hover:bg-white/90"
                  : "interactable border border-white/25 bg-black/45 text-white/95 hover:bg-black/60"
              }
              onClick={exitTutorial}
            >
              {t("tutorial.exit")}
            </Button>
          ) : null}
        </div>,
        document.body,
      )}
    </>
  );
}
