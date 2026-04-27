"use client";

import BoundingBoxOverlay from "@/app/bounding-box-overlay";
import { PointerOverlay } from "@/components/pointer-overlay";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import { captureScreenToPngBase64 } from "@/lib/electron-screen-capture";
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
    generateNextInteractiveStep,
    isGeneratingInteractiveStep,
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
  // Pointer animation target in CSS viewport pixels
  const [pointerTarget, setPointerTarget] = useState<{ x: number; y: number } | null>(null);
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
        setPointerTarget(null);
        setIsLoadingHighlight(false);
        setHighlightError(null);
        return;
      }

      if (currentStep.highlightSelector) {
        setIsLoadingHighlight(false);
        setHighlightError(null);
        setPointerTarget(null);

        const el =
          typeof document !== "undefined" ? (document.querySelector(currentStep.highlightSelector) as HTMLElement | null) : null;
        if (!el) {
          setHighlightPayload(null);
          setHighlightError("I couldn't find that UI element in the app panel.");
          return;
        }

        const rect = el.getBoundingClientRect();
        const expand = currentStep.highlightExpandFactor ?? 1.0;
        const minPad = currentStep.highlightMinPadding ?? 10;
        const offsetX = currentStep.highlightOffsetX ?? 0;
        const offsetY = currentStep.highlightOffsetY ?? 0;

        const w = Math.max(rect.width * expand, rect.width + minPad * 2);
        const h = Math.max(rect.height * expand, rect.height + minPad * 2);
        const cx = rect.left + rect.width / 2 + offsetX;
        const cy = rect.top + rect.height / 2 + offsetY;

        setHighlightPayload({
          coords: {
            x: cx - w / 2,
            y: cy - h / 2,
            width: w,
            height: h,
            confidence: 1,
          },
          screenshotWidth: window.innerWidth,
          screenshotHeight: window.innerHeight,
          useCssCoords: true,
        });
        return;
      }

      if (currentStep.highlightDescription) {
        setHighlightPayload(null);
        setPointerTarget(null);
        setIsLoadingHighlight(true);
        setHighlightError(null);
        if (typeof window === "undefined" || !window.electronAPI?.locateElementComputerUse) {
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

          const result = await window.electronAPI.locateElementComputerUse(
            cap.base64,
            currentStep.highlightDescription,
            cap.width,
            cap.height,
          );
          if (cancelled) {
            setIsLoadingHighlight(false);
            return;
          }

          if (result.success && result.found && result.x != null && result.y != null) {
            setHighlightError(null);
            setHighlightPayload(null);
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            setPointerTarget({
              x: result.x * (vw / cap.width),
              y: result.y * (vh / cap.height),
            });
          } else {
            setHighlightPayload(null);
            setPointerTarget(null);
            setHighlightError(result.explanation ?? result.error ?? "Element not found on screen.");
          }
        } catch (err) {
          if (cancelled) return;
          console.error("Highlight vision failed:", err);
          setHighlightPayload(null);
          setPointerTarget(null);
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
        setPointerTarget(null);
        setHighlightPayload({
          coords: currentStep.highlight,
          screenshotWidth: typeof window !== "undefined" ? window.innerWidth : 1,
          screenshotHeight: typeof window !== "undefined" ? window.innerHeight : 1,
        });
        return;
      }

      setIsLoadingHighlight(false);
      setHighlightPayload(null);
      setPointerTarget(null);
      setHighlightError(null);
    }

    void syncHighlight();
    return () => {
      cancelled = true;
    };
  }, [currentStep]);

  const fallbackW = typeof window !== "undefined" ? window.innerWidth : 1;
  const fallbackH = typeof window !== "undefined" ? window.innerHeight : 1;

  const textBoxStyle = useMemo(() => {
    const vw = viewport.w;
    const vh = viewport.h;
    const margin = 16;
    const maxW = Math.min(420, vw - margin * 2);

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

    if (spotlightRect) {
      const preferBelow = spotlightRect.top + spotlightRect.height + 220 < vh;
      const top = preferBelow ? spotlightRect.top + spotlightRect.height + 12 : spotlightRect.top - 200;
      const left = clamp(spotlightRect.left + spotlightRect.width / 2 - maxW / 2, margin, vw - maxW - margin);

      return {
        width: maxW,
        left,
        top: clamp(top, margin, vh - 180 - margin),
        bottom: undefined as number | undefined,
      };
    }

    if (pointerTarget) {
      const estBoxH = 200;
      const preferBelow = pointerTarget.y + estBoxH + 40 < vh;
      const top = preferBelow ? pointerTarget.y + 40 : pointerTarget.y - estBoxH - 20;
      const left = clamp(pointerTarget.x - maxW / 2, margin, vw - maxW - margin);

      return {
        width: maxW,
        left,
        top: clamp(top, margin, vh - estBoxH - margin),
        bottom: undefined as number | undefined,
      };
    }

    return {
      width: maxW,
      left: margin,
      top: undefined as number | undefined,
      bottom: 64,
    };
  }, [pointerTarget, spotlightRect, viewport.h, viewport.w]);

  if (!mounted || !tutorialId || !activeTutorial || !currentStep) {
    return null;
  }

  const shouldWaitForBox = Boolean(currentStep.highlightDescription);
  const showStepText = !shouldWaitForBox || !isLoadingHighlight;
  const hasSpotlight = Boolean(highlightPayload?.coords);
  const hasPointerHighlight = Boolean(pointerTarget);

  return (
    <>
      {/* Light fallback dim when a tour step has no spotlight target (e.g. the
          welcome step). Kept low-alpha so the panel and what's behind the
          window remain readable — earlier 0.54 alpha + a low-opacity panel
          made the whole UI nearly black. */}
      {!hasSpotlight && !currentStep.highlightBright
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-0"
              style={{
                zIndex: 1000001,
                background: "rgba(8, 10, 16, 0.25)",
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
        expandFactor={2.5}
        useCssCoords={Boolean(highlightPayload?.useCssCoords)}
        brightMode={Boolean(currentStep.highlightBright)}
        onSpotlightRectChange={setSpotlightRect}
      />

      <PointerOverlay
        targetX={pointerTarget?.x ?? null}
        targetY={pointerTarget?.y ?? null}
        label="right here!"
        startX={textBoxStyle.left + (typeof textBoxStyle.width === "number" ? textBoxStyle.width / 2 : 100)}
        startY={
          typeof textBoxStyle.bottom === "number"
            ? viewport.h - textBoxStyle.bottom - 30
            : typeof textBoxStyle.top === "number"
              ? textBoxStyle.top + 30
              : viewport.h - 130
        }
      />

      {showStepText
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[999997] max-h-[42vh] overflow-y-auto rounded-xl border border-white/35 bg-[hsl(var(--foreground)/0.95)] p-4 text-white shadow-2xl backdrop-blur-sm"
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
                    {currentStep.titleRaw
                      ? currentStep.titleRaw
                      : currentStep.title
                        ? t(currentStep.title)
                        : t(activeTutorial.title)}
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
                {currentStep.textRaw ? currentStep.textRaw : t(currentStep.text)}
              </TypographyP>
            </div>,
            document.body,
          )
        : createPortal(
            <div
              className="pointer-events-none fixed inset-0 z-[999997] flex items-center justify-center px-6"
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
                className="pointer-events-none fixed left-1/2 top-6 z-[999998] w-[90vw] max-w-md -translate-x-1/2"
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
        <div className="fixed bottom-4 left-4 z-[999998] flex flex-wrap items-center gap-2">
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
            <Button
              type="button"
              className="interactable bg-white text-black hover:bg-white/90"
              onClick={() => {
                if (isLastStep) {
                  if (tutorialId === "interactive") {
                    void generateNextInteractiveStep();
                    return;
                  }
                  exitTutorial();
                  return;
                }
                nextStep();
              }}
              disabled={tutorialId === "interactive" && isLastStep && isGeneratingInteractiveStep}
            >
              {tutorialId === "interactive" && isLastStep && isGeneratingInteractiveStep ? "Thinking..." : t("tutorial.next")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="interactable border border-white/25 bg-black/45 text-white/95 hover:bg-black/60"
            onClick={exitTutorial}
          >
            {t("tutorial.exit")}
          </Button>
        </div>,
        document.body,
      )}
    </>
  );
}