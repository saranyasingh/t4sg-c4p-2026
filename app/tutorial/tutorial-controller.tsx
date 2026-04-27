"use client";

import BoundingBoxOverlay from "@/app/bounding-box-overlay";
import { PointerOverlay } from "@/components/pointer-overlay";
import { Button } from "@/components/ui/button";
import { TypographyH4, TypographyP, TypographySmall } from "@/components/ui/typography";
import { captureScreenToPngBase64 } from "@/lib/electron-screen-capture";
import type { ScreenHighlight, StepVisual } from "@/lib/tutorials";
import { Search, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { INTERACTIVE_TUTORIAL_ID, type ScreenHighlight, type StepVisual } from "@/lib/tutorials";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import c4pLogo from "../../public/images/c4p.png";
import { useTutorial } from "./tutorial-provider";

interface HighlightErrorState {
  /** Title shown at the top of the card. */
  title: string;
  /** Short, plain-language target name (the thing we were trying to find). */
  target?: string;
  /** Smart, target-aware guidance for how to recover. */
  hint: string;
  /** Optional extra detail from the vision model — only shown when it adds info. */
  detail?: string;
}

/** Map a raw target description to a short, friendly name shown to the user. */
function shortTargetName(description: string): string {
  const d = description.trim();
  const lower = d.toLowerCase();
  if (lower.includes("chrome")) return "Google Chrome";
  if (lower.includes("gmail")) return "Gmail";
  if (lower.includes("address bar")) return "the address bar";
  if (lower.includes("compose")) return "the Compose button";
  if (lower.includes("inbox")) return "the Gmail inbox";
  if (lower.includes("reply") || lower.includes("forward")) return "the Reply or Forward button";
  if (lower.includes("bookmark")) return "the bookmark icon";
  if (lower.includes("tabs") || lower.includes("new tab")) return "the browser tabs";
  if (lower.includes("send button")) return "the Send button";
  // Fall back to the first sentence/clause, trimmed.
  const firstSentence = d.split(/[.!?]/)[0]?.trim() ?? d;
  return firstSentence.length > 80 ? `${firstSentence.slice(0, 77)}…` : firstSentence;
}

/** Choose a contextual hint based on what the step was looking for. */
function smartHintKey(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes("gmail")) return "tutorial.highlightErrorHintGmail";
  if (lower.includes("chrome")) return "tutorial.highlightErrorHintChrome";
  if (lower.includes("browser") || lower.includes("address bar") || lower.includes("tab")) {
    return "tutorial.highlightErrorHintBrowser";
  }
  return "tutorial.highlightErrorHint";
}

/** Decide whether a model explanation is helpful enough to show to the user. */
function usefulDetail(explanation: string | undefined): string | undefined {
  if (!explanation) return undefined;
  const trimmed = explanation.trim();
  if (!trimmed) return undefined;
  // Filter out the boilerplate "not found" string from the API.
  if (/^element not found on screen\.?$/i.test(trimmed)) return undefined;
  if (trimmed.length < 8) return undefined;
  return trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
}

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

  const [highlightError, setHighlightError] = useState<HighlightErrorState | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const buildSmartError = useCallback(
    (description: string | undefined, explanation?: string): HighlightErrorState => {
      const target = description ? shortTargetName(description) : undefined;
      const hintKey = description ? smartHintKey(description) : "tutorial.highlightErrorHint";
      return {
        title: t("tutorial.highlightErrorTitle"),
        target,
        hint: t(hintKey),
        detail: usefulDetail(explanation),
      };
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;

    function buildInteractivePointerDescription(step: NonNullable<typeof currentStep>): string {
      const title = typeof step.titleRaw === "string" ? step.titleRaw.trim() : "";
      const body = typeof step.textRaw === "string" ? step.textRaw.trim() : "";
      const combined = [title, body].filter(Boolean).join(" — ").trim();
      const clipped = combined.length > 420 ? `${combined.slice(0, 420)}…` : combined;
      return clipped || "the main UI element the user should interact with next on the screen";
    }

    async function syncHighlight() {
      if (!currentStep) {
        setHighlightPayload(null);
        setPointerTarget(null);
        setIsLoadingHighlight(false);
        setHighlightError(null);
        return;
      }

      // Always capture a screenshot once per step (Electron only).
      // This supports consistent “computer help” context even for text-only steps.
      let captured:
        | {
            base64: string;
            width: number;
            height: number;
          }
        | null
        | undefined = null;
      try {
        if (typeof window !== "undefined" && window.electronAPI?.requestScreenshotPermission) {
          captured = await captureScreenToPngBase64();
        }
      } catch {
        // ignore capture errors for non-screen steps
      }
      if (cancelled) return;

      if (currentStep.highlightSelector) {
        setIsLoadingHighlight(false);
        setHighlightError(null);
        setPointerTarget(null);

        const el = typeof document !== "undefined" ? document.querySelector(currentStep.highlightSelector) : null;
        if (!el) {
          setHighlightPayload(null);
          setHighlightError({
            title: t("tutorial.highlightErrorTitle"),
            hint: t("tutorial.highlightErrorHint"),
          });
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

        // Interactive tutorials should still show the “yellow arrow” style pointer, even for in-app selector highlights.
        if (tutorialId === INTERACTIVE_TUTORIAL_ID) {
          setPointerTarget({ x: cx, y: cy });
        }
        return;
      }

      if (currentStep.highlightDescription) {
        setHighlightPayload(null);
        setPointerTarget(null);
        setIsLoadingHighlight(true);
        setHighlightError(null);
        if (typeof window === "undefined" || !window.electronAPI?.locateElementComputerUse) {
          setIsLoadingHighlight(false);
          setHighlightError({
            title: t("tutorial.highlightErrorTitle"),
            hint: t("tutorial.highlightErrorHint"),
            detail: "Screen analysis is only available in the desktop app.",
          });
          return;
        }

        try {
          const cap = captured ?? (await captureScreenToPngBase64());
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
            setHighlightError(
              buildSmartError(currentStep.highlightDescription, result.explanation ?? result.error),
            );
          }
        } catch (err) {
          if (cancelled) return;
          console.error("Highlight vision failed:", err);
          setHighlightPayload(null);
          setPointerTarget(null);
          setHighlightError(
            buildSmartError(currentStep.highlightDescription, err instanceof Error ? err.message : undefined),
          );
        }
        setIsLoadingHighlight(false);
        return;
      }

      // Interactive tutorial: always attempt an on-screen pointer after capturing a screenshot,
      // even if the model forgot to include highlightDescription.
      if (tutorialId === INTERACTIVE_TUTORIAL_ID) {
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
          const cap = captured ?? (await captureScreenToPngBase64());
          if (cancelled || !cap) {
            setIsLoadingHighlight(false);
            return;
          }

          const target = buildInteractivePointerDescription(currentStep);
          const result = await window.electronAPI.locateElementComputerUse(cap.base64, target, cap.width, cap.height);
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
          console.error("Interactive pointer vision failed:", err);
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
  }, [currentStep, retryToken, buildSmartError, t]);

  const fallbackW = typeof window !== "undefined" ? window.innerWidth : 1;
  const fallbackH = typeof window !== "undefined" ? window.innerHeight : 1;

  const textBoxStyle = useMemo(() => {
    const vw = viewport.w;
    const margin = 16;
    const maxW = Math.min(420, vw - margin * 2);

    // Anchor the step card to the bottom-left on every step. We intentionally
    // do not reposition it relative to the spotlight or pointer target — a
    // consistent location is easier to scan and matches the welcome step's
    // placement so the tour feels uniform.
    return {
      width: maxW,
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
  const hasPointerHighlight = Boolean(pointerTarget);
  // Whether THIS step is intended to have a highlight target. Used to decide
  // if the no-spotlight dim should render — checking step properties is more
  // reliable than checking `hasSpotlight`, which can briefly be stale during
  // step transitions and would make the dim flicker on/off.
  const stepHasHighlightTarget = Boolean(
    currentStep.highlightSelector ||
      currentStep.highlightDescription ||
      currentStep.highlight ||
      currentStep.highlightBright,
  );

  return (
    <>
      {/* Dim when a tour step has no spotlight target (e.g. the welcome
          step). Matches the dim level used OUTSIDE the spotlight on regular
          tutorial steps so all tour pages feel consistent. Spans only the
          area to the LEFT of the shell panel — the panel itself is
          semi-transparent (0.8) so dimming behind it would bleed through and
          make the panel content unreadable. Panel sits at right-6 with
          w-[420px] so its left edge is at right: 444px. Tour controls
          (z-[999998]) and step card (z-[999997]) stay on top via z-index. */}
      {!stepHasHighlightTarget
        ? createPortal(
            <div
              className="pointer-events-none fixed top-0 bottom-0 left-0"
              style={{ right: 444, zIndex: 999990 }}
              aria-hidden="true"
            >
              <div
                className="absolute inset-0"
                style={{ background: "rgba(0, 0, 0, 0.82)" }}
              />
              <div
                className="absolute inset-0"
                style={{ background: "rgba(0, 3, 10, 0.32)" }}
              />
            </div>,
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
                  <TypographySmall className="m-0 font-semibold uppercase tracking-wide text-white/60">
                    {t(activeTutorial.title)}
                  </TypographySmall>
                  <TypographyH4 id="tutorial-step-title" className="m-0 border-none pb-0 leading-snug text-white">
                    {currentStep.titleRaw
                      ? currentStep.titleRaw
                      : currentStep.title
                        ? t(currentStep.title)
                        : t(activeTutorial.title)}
                  </TypographyH4>
                </div>
              </div>
              <TypographyP id="tutorial-step-body" className="mt-0 whitespace-pre-wrap leading-relaxed">
                {currentStep.textRaw ? currentStep.textRaw : t(currentStep.text)}
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
              <TypographySmall className="m-0 rounded-lg border border-white/30 bg-black/70 px-4 py-2 tracking-wide text-white">
                Loading...
              </TypographySmall>
            </div>,
            document.body,
          )}
        {highlightError
          ? createPortal(
              <div
                className="fixed left-1/2 top-6 z-[999998] w-[90vw] max-w-md -translate-x-1/2"
                role="alert"
                aria-live="assertive"
              >
                <div
                  className="overflow-hidden rounded-2xl border border-white/40 bg-[hsl(var(--foreground)/0.96)] text-white shadow-2xl backdrop-blur-md"
                  style={{
                    boxShadow:
                      "0 18px 40px rgba(0, 20, 7, 0.45), 0 0 0 1px hsl(var(--primary) / 0.35)",
                  }}
                >
                  <div
                    className="h-1.5 w-full"
                    style={{
                      background:
                        "linear-gradient(90deg, var(--green-1) 0%, var(--green-2) 50%, var(--green-3) 100%)",
                    }}
                    aria-hidden="true"
                  />
                  <div className="flex items-start gap-3 px-5 py-4">
                    <div className="flex shrink-0 items-center gap-2">
                      <Image
                        src={c4pLogo}
                        alt="Computers 4 People"
                        width={32}
                        height={32}
                        className="rounded-md bg-white/10 p-1"
                      />
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full"
                        style={{ background: "hsl(var(--primary) / 0.18)", color: "var(--green-1)" }}
                        aria-hidden="true"
                      >
                        <Search className="h-4 w-4" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-tight tracking-wide" style={{ color: "var(--green-1)" }}>
                        {highlightError.title}
                      </p>
                      {highlightError.target ? (
                        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-white/65">
                          {t("tutorial.highlightErrorTargetLabel", { target: highlightError.target })}
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm leading-snug text-white/95">{highlightError.hint}</p>
                      {highlightError.detail ? (
                        <p className="mt-2 text-xs leading-snug text-white/65">{highlightError.detail}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="interactable h-8 rounded-full px-3 text-xs font-semibold"
                          style={{
                            background: "var(--green-1)",
                            color: "var(--black)",
                          }}
                          onClick={() => setRetryToken((n) => n + 1)}
                        >
                          {t("tutorial.highlightErrorRetry")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="interactable h-8 rounded-full border border-white/25 bg-white/5 px-3 text-xs font-semibold text-white/85 hover:bg-white/15"
                          onClick={() => setHighlightError(null)}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          {t("tutorial.highlightErrorDismiss")}
                        </Button>
                      </div>
                    </div>
                  </div>
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
              <TypographySmall className="m-0 font-semibold leading-none text-inherit">
                {t("tutorial.back")}
              </TypographySmall>
            </Button>
          ) : null}
          {canGoNext ? (
            <Button
              type="button"
              className="interactable bg-white text-black hover:bg-white/90"
              onClick={() => {
                if (isLastStep) {
                  if (tutorialId === INTERACTIVE_TUTORIAL_ID) {
                    void generateNextInteractiveStep();
                    return;
                  }
                  exitTutorial();
                  return;
                }
                nextStep();
              }}
              disabled={tutorialId === INTERACTIVE_TUTORIAL_ID && isLastStep && isGeneratingInteractiveStep}
            >
              <TypographySmall className="m-0 font-semibold leading-none text-inherit">
                {tutorialId === "interactive" && isLastStep && isGeneratingInteractiveStep
                  ? "Thinking..."
                  : t("tutorial.next")}
              </TypographySmall>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="interactable border border-white/25 bg-black/45 text-white/95 hover:bg-accent hover:text-accent-foreground"
            onClick={exitTutorial}
          >
            <TypographySmall className="m-0 font-semibold leading-none text-inherit">
              {t("tutorial.exit")}
            </TypographySmall>
          </Button>
        </div>,
        document.body,
      )}
    </>
  );
}
