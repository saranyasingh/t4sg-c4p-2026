"use client";

import { PointerOverlay } from "@/components/pointer-overlay";
import { Button } from "@/components/ui/button";
import { TypographyH4, TypographyP, TypographySmall } from "@/components/ui/typography";
import { captureScreenToPngBase64 } from "@/lib/electron-screen-capture";
import {
  INTERACTIVE_TUTORIAL_ID,
  INTRO_TUTORIAL_ID,
  type TutorialStep,
} from "@/lib/tutorials";
import { Search, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { compressScreenshotForTutorialApi } from "@/lib/interactive-tutorial-screenshot";
import { extractStepFromAnthropicContent } from "@/lib/interactive-tutorial-step-parse";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import c4pLogo from "../../public/images/c4p.png";
import { useTutorial } from "./tutorial-provider";

interface HighlightErrorState {
  /** Title shown at the top of the card. */
  title: string;
  /** Smart, target-aware guidance for how to recover. */
  hint: string;
  /** Full detail from the vision model or API (scrollable; not truncated). */
  detail?: string;
}

/** Shown to the interactive step-revision API when the locator could not produce coordinates. */
const REVISION_LOCATOR_HINT =
  "Computer Use did not return coordinates for the current step; the control may be off-screen, covered by another window, in the wrong application, or the screenshot does not match the lesson — revise the step so highlightDescription matches what is actually visible.";

/** Map a raw target description to a short, friendly name shown to the user. */
function shortTargetName(description: string): string {
  const d = description.trim();
  const lower = d.toLowerCase();
  // Check specific subjects FIRST. Tutorial descriptions often mention
  // "Chrome" or "Gmail" as surrounding context (e.g. "the address bar at the
  // top of Google Chrome…"), so a naive `includes("chrome")` check would
  // wrongly label every step as targeting Chrome itself.
  if (lower.includes("address bar")) return "the address bar";
  if (lower.includes("compose")) return "the Compose button";
  if (lower.includes("inbox")) return "the Gmail inbox";
  if (lower.includes("reply") || lower.includes("forward")) return "the Reply or Forward button";
  if (lower.includes("bookmark")) return "the bookmark icon";
  if (lower.includes("tabs") || lower.includes("new tab")) return "the browser tabs";
  if (lower.includes("send button")) return "the Send button";
  if (lower.includes("refresh") || lower.includes("back arrow") || lower.includes("forward arrow")) {
    return "the navigation buttons";
  }
  if (lower.includes("profile picture") || lower.includes("account") || lower.includes("user")) {
    return "the Chrome user icon";
  }
  if (lower.includes("three") && (lower.includes("dots") || lower.includes("menu"))) {
    return "the Chrome menu";
  }
  // Fall back to the app-level subject (Chrome / Gmail) only if nothing more
  // specific matched — this matches the case where the step is genuinely
  // pointing at the app icon itself.
  if (lower.includes("gmail")) return "Gmail";
  if (lower.includes("chrome")) return "Google Chrome";
  // Final fallback: first sentence/clause, trimmed.
  const firstSentence = d.split(/[.!?]/)[0]?.trim() ?? d;
  return firstSentence.length > 120 ? `${firstSentence.slice(0, 117)}…` : firstSentence;
}

/** Choose a contextual hint based on what the step was looking for. */
function smartHintKey(description: string): string {
  const lower = description.toLowerCase();
  // Check specific in-browser surfaces BEFORE Chrome/Gmail, since most step
  // descriptions mention those apps as ambient context (see shortTargetName).
  if (lower.includes("address bar") || lower.includes("tab") || lower.includes("bookmark")) {
    return "tutorial.highlightErrorHintBrowser";
  }
  if (lower.includes("inbox") || lower.includes("compose") || lower.includes("reply") || lower.includes("forward")) {
    return "tutorial.highlightErrorHintGmail";
  }
  if (lower.includes("gmail")) return "tutorial.highlightErrorHintGmail";
  if (lower.includes("chrome")) return "tutorial.highlightErrorHintChrome";
  if (lower.includes("browser")) return "tutorial.highlightErrorHintBrowser";
  return "tutorial.highlightErrorHint";
}

/** Normalize vision / IPC explanation for display: full text, no truncation. */
function normalizeLocateExplanation(explanation: string | undefined): string | undefined {
  if (!explanation) return undefined;
  const trimmed = explanation.trim();
  if (!trimmed) return undefined;
  if (/^element not found on screen\.?$/i.test(trimmed)) return undefined;
  if (trimmed.length < 2) return undefined;
  return trimmed;
}

/**
 * Tutorial UI + Claude Computer Use API pointer overlay. Renders the lesson
 * card, the navigation buttons, and the animated arrow that points at the
 * vision-located target on the user's screen.
 */
export function TutorialController() {
  const { t } = useTranslation();
  const {
    tutorialId,
    activeTutorial,
    currentStep,
    currentStepIndex,
    interactiveGoal,
    replaceInteractiveStepAt,
    exitTutorial,
    nextStep,
    previousStep,
    canGoNext,
    canGoPrevious,
    isLastStep,
    generateNextInteractiveStep,
    isGeneratingInteractiveStep,
    tutorialChatOverride,
    isAskingTutorialQuestion,
  } = useTutorial();

  // Highlights are rendered exclusively via the Claude Computer Use API
  // pointer (`PointerOverlay`). The two callbacks below are no-op sinks so
  // the existing `syncHighlight` effect can still call them without
  // TypeScript errors — every call is a dead-end and nothing in the render
  // tree reads the values.
  const setHighlightPayload = useCallback((_v: unknown) => {
    /* no-op */
  }, []);
  const setIsLoadingHighlight = useCallback((_v: boolean) => {
    /* no-op */
  }, []);
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
  const lastRevisionStepIdRef = useRef<string | null>(null);
  const revisionAttemptsRef = useRef(0);

  const buildSmartError = useCallback(
    (description: string | undefined, explanation?: string): HighlightErrorState => {
      const friendlyTarget = description ? shortTargetName(description) : undefined;
      const hintKey = description ? smartHintKey(description) : "tutorial.highlightErrorHint";
      const normalized = normalizeLocateExplanation(explanation);
      const detail = normalized ?? (explanation?.trim() ? explanation.trim() : undefined);
      return {
        title: friendlyTarget
          ? t("tutorial.highlightErrorTitleWithTarget", { target: friendlyTarget })
          : t("tutorial.highlightErrorTitle"),
        hint: t(hintKey).trim(),
        detail,
      };
    },
    [t],
  );

  const buildLocateHighlightError = useCallback(
    (
      description: string | undefined,
      result: {
        success: boolean;
        found?: boolean;
        explanation?: string;
        error?: string;
        hint?: string;
        reason?: string;
      },
    ): HighlightErrorState => {
      const hintKey = description ? smartHintKey(description) : "tutorial.highlightErrorHint";
      const contextualHint = t(hintKey).trim();
      const friendlyTarget = description ? shortTargetName(description) : undefined;
      const title = friendlyTarget
        ? t("tutorial.highlightErrorTitleWithTarget", { target: friendlyTarget })
        : t("tutorial.highlightErrorTitle");

      if (result.reason === "anthropic_not_configured") {
        return {
          title: t("tutorial.highlightErrorTitle"),
          hint: t("tutorial.highlightErrorAnthropicNotConfigured"),
        };
      }

      if (!result.success) {
        const detailParts = [result.error, result.hint].filter((x) => typeof x === "string" && x.trim());
        return {
          title,
          hint: contextualHint,
          detail: detailParts.length ? detailParts.join("\n\n") : t("tutorial.highlightErrorFallbackDetail"),
        };
      }

      const exp = result.explanation ?? result.error;
      const normalized = normalizeLocateExplanation(exp);
      const detail = normalized ?? t("tutorial.highlightErrorFallbackDetail");
      return {
        title,
        hint: contextualHint,
        detail,
      };
    },
    [t],
  );

  // Synchronously flip into the loading state when the active step changes
  // and that step needs an async on-screen location lookup. Without this,
  // the new step renders for one frame with the previous step's resolved
  // (non-loading) state, so the user sees: step → "Loading..." → step. The
  // layout effect commits before paint so the first frame is "Loading..."
  // for steps that wait on a highlightDescription resolve.
  useLayoutEffect(() => {
    if (!currentStep) return;
    if (currentStep.highlightDescription) {
      setIsLoadingHighlight(true);
      setHighlightPayload(null);
      setPointerTarget(null);
      setHighlightError(null);
    }
  }, [currentStep, retryToken]);

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

      if (tutorialId === INTERACTIVE_TUTORIAL_ID) {
        if (lastRevisionStepIdRef.current !== currentStep.id) {
          lastRevisionStepIdRef.current = currentStep.id;
          revisionAttemptsRef.current = 0;
        }
      }

      async function tryReviseStepFromScreenshot(
        cap: { base64: string; width: number; height: number },
        stepSnapshot: TutorialStep,
        locatorHint: string,
      ): Promise<boolean> {
        if (tutorialId !== INTERACTIVE_TUTORIAL_ID || cancelled) return false;
        revisionAttemptsRef.current += 1;
        if (revisionAttemptsRef.current > 2) return false;

        try {
          const optimized = await compressScreenshotForTutorialApi(cap.base64);
          const messages: MessageParam[] = [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: optimized.mediaType,
                    data: optimized.base64,
                  },
                },
                {
                  type: "text",
                  text:
                    `Original tutorial goal:\n${interactiveGoal || "(unknown)"}\n\n` +
                    `Current step JSON (may not match the screenshot):\n${JSON.stringify({
                      id: stepSnapshot.id,
                      titleRaw: stepSnapshot.titleRaw,
                      textRaw: stepSnapshot.textRaw,
                      visual: stepSnapshot.visual,
                      highlightDescription: stepSnapshot.highlightDescription,
                    })}\n\n` +
                    `Locator / mismatch note: ${locatorHint}\n\n` +
                    `Return ONE replacement tutorial step JSON that matches the screenshot and tells the user the correct next action.`,
                },
              ] as any,
            },
          ];

          const res = await fetch("/api/interactive-tutorial-sync-step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages }),
          });
          if (!res.ok || cancelled) return false;
          const data = (await res.json()) as { content?: unknown };
          let revised = extractStepFromAnthropicContent(data.content);
          if (!revised || cancelled) return false;

          // The step parser already strips every targeting field except
          // `highlightDescription`, so the revised step is guaranteed to use
          // the Claude Computer Use API pointer exclusively.

          replaceInteractiveStepAt(currentStepIndex, revised);
          revisionAttemptsRef.current = 0;
          setHighlightError(null);
          setRetryToken((t) => t + 1);
          return true;
        } catch (e) {
          console.error("Interactive step revision failed:", e);
          return false;
        }
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

      // ====================================================================
      // INTERACTIVE TUTORIAL: Claude Computer Use API ONLY.
      //
      // The only supported targeting field is `highlightDescription`, which
      // is resolved by the Claude Computer Use API. There is no other path.
      // ====================================================================
      if (tutorialId === INTERACTIVE_TUTORIAL_ID) {
        setHighlightPayload(null);

        // Text-only steps: no on-screen pointer, no highlight. Done.
        if (currentStep.visual === "text" && !currentStep.highlightDescription) {
          setPointerTarget(null);
          setIsLoadingHighlight(false);
          setHighlightError(null);
          return;
        }

        setPointerTarget(null);
        setIsLoadingHighlight(true);
        setHighlightError(null);

        if (typeof window === "undefined" || !window.electronAPI?.locateElementComputerUse) {
          setIsLoadingHighlight(false);
          setHighlightError({
            title: t("tutorial.highlightErrorTitle"),
            hint: t("tutorial.highlightErrorHint"),
            detail: t("tutorial.highlightErrorDesktopOnly"),
          });
          return;
        }

        const locateTargetDescription = currentStep.highlightDescription
          ? currentStep.highlightDescription
          : buildInteractivePointerDescription(currentStep);

        try {
          const cap = captured ?? (await captureScreenToPngBase64());
          if (cancelled || !cap) {
            setIsLoadingHighlight(false);
            return;
          }

          const result = await window.electronAPI.locateElementComputerUse(
            cap.base64,
            locateTargetDescription,
            cap.width,
            cap.height,
          );
          if (cancelled) {
            setIsLoadingHighlight(false);
            return;
          }

          if (result.success && result.found && result.x != null && result.y != null) {
            setHighlightError(null);
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            setPointerTarget({
              x: result.x * (vw / cap.width),
              y: result.y * (vh / cap.height),
            });
          } else {
            setPointerTarget(null);
            if (
              result.success &&
              cap &&
              !cancelled &&
              (await tryReviseStepFromScreenshot(
                cap,
                currentStep,
                result.explanation ?? result.error ?? REVISION_LOCATOR_HINT,
              ))
            ) {
              setIsLoadingHighlight(false);
              return;
            }
            setHighlightError(buildLocateHighlightError(locateTargetDescription, result));
          }
        } catch (err) {
          if (cancelled) return;
          console.error("Interactive pointer vision failed:", err);
          setPointerTarget(null);
          setHighlightError(
            buildSmartError(
              locateTargetDescription,
              err instanceof Error ? err.message : undefined,
            ),
          );
        }
        setIsLoadingHighlight(false);
        return;
      }

      // ====================================================================
      // NON-INTERACTIVE TUTORIALS (App Tour / Gmail / Google Search).
      //
      // Steps with `highlightDescription` get a vision-located arrow drawn by
      // `PointerOverlay` (Claude Computer Use API). Text-only steps render no
      // pointer at all. There is no other targeting path.
      // ====================================================================
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
            detail: t("tutorial.highlightErrorDesktopOnly"),
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
            setHighlightError(buildLocateHighlightError(currentStep.highlightDescription, result));
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

      // Text-only step (or stray legacy fields) — no spotlight, no arrow.
      setIsLoadingHighlight(false);
      setHighlightPayload(null);
      setPointerTarget(null);
      setHighlightError(null);
    }

    void syncHighlight();
    return () => {
      cancelled = true;
    };
  }, [
    currentStep,
    retryToken,
    buildSmartError,
    buildLocateHighlightError,
    t,
    tutorialId,
    interactiveGoal,
    replaceInteractiveStepAt,
    currentStepIndex,
  ]);

  // When the chat Q&A returns a highlight_element tool call, run a separate
  // locate pass for the requested element. Independent of the step-change
  // highlight so it doesn't interfere with the tutorial flow.
  useEffect(() => {
    const description = tutorialChatOverride?.highlightDescription;
    if (!description) return;

    let cancelled = false;

    async function locateChatHighlight() {
      if (typeof window === "undefined" || !window.electronAPI?.locateElementComputerUse) return;

      try {
        const cap = await captureScreenToPngBase64();
        if (cancelled || !cap) return;

        const result = await window.electronAPI.locateElementComputerUse(
          cap.base64,
          description,
          cap.width,
          cap.height,
        );
        if (cancelled) return;

        if (result.success && result.found && result.x != null && result.y != null) {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          setPointerTarget({
            x: result.x * (vw / cap.width),
            y: result.y * (vh / cap.height),
          });
        }
      } catch {
        // Silently ignore — chat highlight is best-effort
      }
    }

    void locateChatHighlight();
    return () => {
      cancelled = true;
    };
  }, [tutorialChatOverride?.highlightDescription]);

  const fallbackW = typeof window !== "undefined" ? window.innerWidth : 1;
  const fallbackH = typeof window !== "undefined" ? window.innerHeight : 1;

  const textBoxStyle = useMemo(() => {
    const vw = viewport.w;
    const vh = viewport.h;
    const margin = 24;
    const maxW = Math.min(620, vw - margin * 2);
    const left = Math.max(margin, (vw - maxW) / 2);
    // Sit just above true vertical center so the step card is the visual
    // focus of the screen, while leaving room for the bottom navigation
    // (back / next / exit) and any pointer arrival underneath.
    const approxH = Math.min(vh * 0.6, 460);
    const top = Math.max(margin, Math.round(vh / 2 - approxH / 2));

    // Anchor the step card to the bottom-left on every step. We intentionally
    // do not reposition it relative to the pointer target — a consistent
    // location is easier to scan.
    //
    // For CONTENT tutorials (Gmail / Google Search / interactive AI), the
    // lesson card is paired with the slim chat box. The chat box is anchored
    // at bottom: 64 and is ~44px tall (top edge ≈ 108). We push the card to
    // bottom: 144 to leave a clear ~36px gap so the two read as a vertical
    // stack with breathing room and never visually collide:
    //     [ lesson step card  ]
    //     [ Ask a question…   ]
    //     [ Back · Next · Exit ]
    //
    // For the App Tour the chat box is NOT shown (the chatbot lives in the
    // visible side panel), so the card uses the lower `standardBottom`.
    const isContentTutorial = tutorialId != null && tutorialId !== INTRO_TUTORIAL_ID;
    const stackedWithChatBottom = 144;
    const standardBottom = 64;
    return {
      width: maxW,
      left: margin,
      top: undefined as number | undefined,
      bottom: isContentTutorial ? stackedWithChatBottom : standardBottom,
      approxHeight: approxH,
    };
  }, [tutorialId, viewport.w, viewport.h]);

  const isInteractive = tutorialId === INTERACTIVE_TUTORIAL_ID;
  // For non-interactive tutorials we keep the previous behavior: nothing
  // renders until the step is ready. For interactive tutorials we render a
  // placeholder lesson card during the brief "Setting up your tutorial..."
  // window (between the user clicking Start and the first step arriving) so
  // the user has something to look at while the panel is hidden off-screen.
  if (!mounted || !tutorialId || !activeTutorial) {
    return null;
  }
  if (!currentStep && !isInteractive) {
    return null;
  }

  // Keep the step card visible even while highlights/pointers are being located.
  // Hiding it causes a noticeable flash (title appears, disappears, then reappears).
  const showStepText = true;

  // Placeholder copy shown in the lesson card while the first interactive
  // tutorial step is still being generated. Mirrors the lesson card style so
  // the transition into the real step feels seamless.
  const placeholderTitle = "Setting up your tutorial…";
  const placeholderBody = interactiveGoal
    ? `Looking at your screen and figuring out where to begin for: ${interactiveGoal}.`
    : "Looking at your screen and figuring out where to begin.";

  // Whether the GransonAI panel has been collapsed off-screen. Mirrors the
  // logic in shell-layout.tsx: panel hides for content tutorials (Gmail /
  // Google Search / interactive AI) and stays visible for the App Tour.

  return (
    <>
      <PointerOverlay
        targetX={pointerTarget?.x ?? null}
        targetY={pointerTarget?.y ?? null}
        label="right here!"
        startX={textBoxStyle.left + (typeof textBoxStyle.width === "number" ? textBoxStyle.width / 2 : 100)}
        startY={
          typeof textBoxStyle.bottom === "number"
            ? viewport.h - textBoxStyle.bottom - 30
            : typeof textBoxStyle.top === "number"
              ? textBoxStyle.top + textBoxStyle.approxHeight - 24
              : viewport.h - 130
        }
      />

    {showStepText
        ? createPortal(
            <div
              data-tutorial-chrome
              className="pointer-events-none fixed z-[1000003] max-h-[42vh] overflow-y-auto rounded-xl border border-white/35 bg-[hsl(var(--foreground)/0.95)] p-4 text-white shadow-2xl backdrop-blur-sm"
              style={{
                left: textBoxStyle.left,
                top: textBoxStyle.top,
                bottom: textBoxStyle.bottom,
                width: textBoxStyle.width,
                maxHeight: "calc(100vh - 160px)",
              }}
              role="dialog"
              aria-labelledby="tutorial-step-title"
              aria-describedby="tutorial-step-body"
            >
              {/* When the user asks the chat box a question during a hand-authored
                  tutorial, `tutorialChatOverride` is set and we display the AI's
                  answer here instead of the original step content. The overlay is
                  pinned to the step's id, so navigating Back/Next clears it
                  automatically and the lesson resumes. */}
              {(() => {
                const overlayActive =
                  tutorialChatOverride && currentStep && tutorialChatOverride.stepId === currentStep.id
                    ? tutorialChatOverride
                    : null;
                const askingForCurrentStep = isAskingTutorialQuestion && !overlayActive;

                const headerLabel = overlayActive
                  ? "Answer"
                  : isInteractive && !currentStep
                    ? "Setting up"
                    : t(activeTutorial.title);

                const titleText = overlayActive
                  ? overlayActive.titleRaw
                  : askingForCurrentStep
                    ? "Thinking…"
                    : currentStep?.titleRaw
                      ? currentStep.titleRaw
                      : currentStep?.title
                        ? t(currentStep.title)
                        : isInteractive && !currentStep
                          ? placeholderTitle
                          : t(activeTutorial.title);

                const bodyText = overlayActive
                  ? overlayActive.textRaw
                  : askingForCurrentStep
                    ? "One moment — looking up an answer to your question."
                    : currentStep?.textRaw
                      ? currentStep.textRaw
                      : currentStep
                        ? t(currentStep.text)
                        : placeholderBody;

                return (
                  <>
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <TypographySmall className="m-0 font-semibold uppercase tracking-wide text-white/60">
                          {headerLabel}
                        </TypographySmall>
                        <TypographyH4 id="tutorial-step-title" className="m-0 border-none pb-0 leading-snug text-white">
                          {titleText}
                        </TypographyH4>
                      </div>
                    </div>
                    <TypographyP id="tutorial-step-body" className="mt-0 whitespace-pre-wrap leading-relaxed">
                      {bodyText}
                    </TypographyP>
                  </>
                );
              })()}
            </div>,
            document.body,
          )
        : null}
      {highlightError
          ? createPortal(
              <div
                data-tutorial-chrome
                className="fixed left-1/2 top-6 z-[999998] flex max-h-[85vh] w-[92vw] max-w-lg -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-white/15 shadow-[0_12px_40px_rgba(0,20,7,0.55)]"
                style={{ background: "var(--green-5)" }}
                role="alert"
                aria-live="assertive"
              >
                <div
                  className="h-1.5 w-full shrink-0"
                  style={{
                    background: "linear-gradient(90deg, var(--green-1) 0%, var(--green-2) 50%, var(--green-3) 100%)",
                  }}
                  aria-hidden="true"
                />
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex shrink-0 items-start gap-3 px-5 pb-2 pt-4">
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
                      <p className="mt-2 text-sm leading-snug text-white/95">{highlightError.hint}</p>
                    </div>
                  </div>
                  {highlightError.detail ? (
                    <div className="mx-5 mb-1 min-h-0 max-h-[min(50vh,22rem)] overflow-y-auto rounded-md border border-white/10 bg-black/15 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                        {t("tutorial.highlightErrorDetected")}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-snug text-white/80">
                        {highlightError.detail}
                      </p>
                    </div>
                  ) : null}
                  <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pb-4 pt-2">
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
              </div>,
            document.body,
          )
        : null}

      {createPortal(
        <div data-tutorial-chrome className="fixed bottom-4 left-4 z-[1000004] flex flex-wrap items-center gap-2">
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
              data-intro={isLastStep ? "tutorial-finish" : undefined}
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
            data-intro="tutorial-exit"
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
