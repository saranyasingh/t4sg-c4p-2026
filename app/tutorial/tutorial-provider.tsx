"use client";

import { getTutorialById, INTERACTIVE_TUTORIAL_ID, type Tutorial, type TutorialStep } from "@/lib/tutorials";
import { useTranslation } from "react-i18next";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * When the user asks the chat box a question during a non-interactive tutorial
 * (intro, Google Search, Gmail), the AI answer is stored here and overlays the
 * lesson card content for the matching step. It auto-clears when the user
 * navigates to a different step.
 */
export interface TutorialChatOverride {
  stepId: string;
  titleRaw: string;
  textRaw: string;
}

export type TutorialContextValue = {
  /** `tutorialId !== null` means a tutorial is active (tutorial “mode”). */
  tutorialId: string | null;
  currentStepIndex: number;
  /** Original user goal string while an interactive tutorial is active (empty otherwise). */
  interactiveGoal: string;
  activeTutorial: Tutorial | null;
  currentStep: TutorialStep | null;
  startTutorial: (id: string) => void;
  startInteractiveTutorial: (goal: string) => void;
  addInteractiveStep: (step: TutorialStep) => void;
  replaceInteractiveStepAt: (index: number, step: TutorialStep) => void;
  registerInteractiveNextStepGenerator: (fn: (() => Promise<void>) | null) => void;
  registerInteractivePromptHandler: (fn: ((text: string) => Promise<void>) | null) => void;
  sendInteractivePrompt: (text: string) => Promise<void>;
  generateNextInteractiveStep: () => Promise<void>;
  isGeneratingInteractiveStep: boolean;
  /**
   * Q&A answer overlay for non-interactive tutorials. Set when the user asks
   * a question via the floating chat box; null otherwise.
   */
  tutorialChatOverride: TutorialChatOverride | null;
  /** Submit a chat question. Routes to the interactive flow for the AI tutorial,
   *  or to /api/tutorial-chat (overlay) for hand-authored tutorials. */
  askTutorialQuestion: (text: string) => Promise<void>;
  isAskingTutorialQuestion: boolean;
  /** Manually clear any chat-answer overlay. Also clears automatically on step change. */
  clearTutorialChatOverride: () => void;
  exitTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [tutorialId, setTutorialId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const [interactiveGoal, setInteractiveGoal] = useState<string>("");
  const [interactiveSteps, setInteractiveSteps] = useState<TutorialStep[]>([]);
  const [interactiveGenerator, setInteractiveGenerator] = useState<(() => Promise<void>) | null>(null);
  const [interactivePromptHandler, setInteractivePromptHandler] = useState<((text: string) => Promise<void>) | null>(
    null,
  );
  const [isGeneratingInteractiveStep, setIsGeneratingInteractiveStep] = useState(false);

  /** Q&A overlay state for non-interactive tutorials (see TutorialChatOverride docs). */
  const [tutorialChatOverride, setTutorialChatOverride] = useState<TutorialChatOverride | null>(null);
  const [isAskingTutorialQuestion, setIsAskingTutorialQuestion] = useState(false);
  const interactiveStepsLenRef = useRef(0);
  /** After appending a step, jump only once `interactiveSteps` state includes it (avoids index clamp races). */
  const pendingJumpToLatestInteractiveStepRef = useRef(false);
  const tutorialIdRef = useRef<string | null>(tutorialId);
  tutorialIdRef.current = tutorialId;

  useEffect(() => {
    // Keep this in sync for code paths that replace steps in bulk.
    interactiveStepsLenRef.current = interactiveSteps.length;
  }, [interactiveSteps.length]);

  const activeTutorial =
    tutorialId === INTERACTIVE_TUTORIAL_ID
      ? ({
          id: INTERACTIVE_TUTORIAL_ID,
          title: interactiveGoal ? `Interactive: ${interactiveGoal}` : "Interactive tutorial",
          steps: interactiveSteps,
        } satisfies Tutorial)
      : tutorialId
        ? getTutorialById(tutorialId) ?? null
        : null;

  const steps = activeTutorial?.steps ?? [];
  const lastIndex = Math.max(0, steps.length - 1);
  const safeStepIndex = steps.length ? Math.min(currentStepIndex, lastIndex) : 0;
  const currentStep = steps[safeStepIndex] ?? null;

  const isFirstStep = safeStepIndex <= 0;
  const isLastStep = steps.length > 0 && safeStepIndex >= lastIndex;
  const canGoNext = Boolean(activeTutorial && steps.length > 0);
  const canGoPrevious = Boolean(activeTutorial && !isFirstStep);

  useEffect(() => {
    if (tutorialId) {
      setCurrentStepIndex(0);
    }
  }, [tutorialId]);

  // After a new interactive step is committed, move to it (chat prompt or Next-generated).
  useLayoutEffect(() => {
    if (tutorialId !== INTERACTIVE_TUTORIAL_ID) return;
    if (!pendingJumpToLatestInteractiveStepRef.current) return;
    pendingJumpToLatestInteractiveStepRef.current = false;
    const len = interactiveSteps.length;
    if (len === 0) return;
    setCurrentStepIndex(len - 1);
  }, [tutorialId, interactiveSteps]);

  useEffect(() => {
    if (!activeTutorial || !steps.length) return;
    // Interactive: do not clamp here — setting index to the new last step before `interactiveSteps`
    // commits makes currentStepIndex > lastIndex for one tick and this effect would reset it (extra Next).
    if (tutorialId === INTERACTIVE_TUTORIAL_ID) return;
    if (currentStepIndex > lastIndex) {
      setCurrentStepIndex(lastIndex);
    }
  }, [activeTutorial, currentStepIndex, lastIndex, steps.length, tutorialId]);

  const startTutorial = useCallback((id: string) => {
    setTutorialId((prev) => (prev === id ? null : id));
  }, []);

  const startInteractiveTutorial = useCallback((goal: string) => {
    setInteractiveGoal(goal.trim());
    setInteractiveSteps([]);
    interactiveStepsLenRef.current = 0;
    setTutorialId(INTERACTIVE_TUTORIAL_ID);
    setCurrentStepIndex(0);
  }, []);

  const addInteractiveStep = useCallback((step: TutorialStep) => {
    // Update the length ref immediately so "Next" can advance right after the
    // generator finishes, even if React batches the state update.
    interactiveStepsLenRef.current += 1;
    if (tutorialIdRef.current === INTERACTIVE_TUTORIAL_ID) {
      // Ensures chat prompts / Next-generated steps always land on the new step once committed.
      pendingJumpToLatestInteractiveStepRef.current = true;
    }
    setInteractiveSteps((prev) => {
      const next = [...prev, step];
      interactiveStepsLenRef.current = next.length;
      return next;
    });
  }, []);

  const replaceInteractiveStepAt = useCallback((index: number, step: TutorialStep) => {
    setInteractiveSteps((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      next[index] = step;
      interactiveStepsLenRef.current = next.length;
      return next;
    });
  }, []);

  const registerInteractiveNextStepGenerator = useCallback((fn: (() => Promise<void>) | null) => {
    setInteractiveGenerator(() => fn);
  }, []);

  const registerInteractivePromptHandler = useCallback((fn: ((text: string) => Promise<void>) | null) => {
    setInteractivePromptHandler(() => fn);
  }, []);

  const sendInteractivePrompt = useCallback(
    async (text: string) => {
      if (!interactivePromptHandler) return;
      await interactivePromptHandler(text);
      // Jump is scheduled inside addInteractiveStep when a new step is appended.
    },
    [interactivePromptHandler],
  );

  const clearTutorialChatOverride = useCallback(() => {
    setTutorialChatOverride(null);
  }, []);

  /**
   * Submit a chat question while a tutorial is active.
   * - For the interactive AI tutorial, route through `sendInteractivePrompt`
   *   so the model's response becomes the next tutorial step.
   * - For hand-authored tutorials (intro / Google Search / Gmail), call the
   *   simple /api/tutorial-chat endpoint and overlay the answer onto the
   *   current step's lesson card. The overlay clears as soon as the user
   *   navigates to a different step.
   */
  const askTutorialQuestion = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (tutorialId === INTERACTIVE_TUTORIAL_ID) {
        await sendInteractivePrompt(trimmed);
        return;
      }

      // Resolve current tutorial / step so we can give the model context.
      const activeT = tutorialId ? getTutorialById(tutorialId) : null;
      if (!activeT) return;
      const steps = activeT.steps;
      if (!steps.length) return;
      const idx = Math.min(Math.max(currentStepIndex, 0), steps.length - 1);
      const cur = steps[idx];
      if (!cur) return;

      const tutorialName = (() => {
        try {
          return t(activeT.title);
        } catch {
          return activeT.title;
        }
      })();
      const stepTitle = cur.titleRaw
        ? cur.titleRaw
        : cur.title
          ? (() => {
              try {
                return t(cur.title);
              } catch {
                return cur.title;
              }
            })()
          : "";
      const stepBody = cur.textRaw
        ? cur.textRaw
        : cur.text
          ? (() => {
              try {
                return t(cur.text);
              } catch {
                return cur.text;
              }
            })()
          : "";

      setIsAskingTutorialQuestion(true);
      try {
        const res = await fetch("/api/tutorial-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmed,
            tutorialName,
            currentStepTitle: stepTitle,
            currentStepBody: stepBody,
          }),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(errBody?.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { titleRaw?: string; textRaw?: string };
        if (typeof data.textRaw !== "string" || !data.textRaw.trim()) {
          throw new Error("Empty answer from assistant");
        }
        setTutorialChatOverride({
          stepId: cur.id,
          titleRaw: data.titleRaw && data.titleRaw.trim() ? data.titleRaw.trim() : "Quick answer",
          textRaw: data.textRaw,
        });
      } finally {
        setIsAskingTutorialQuestion(false);
      }
    },
    [currentStepIndex, sendInteractivePrompt, t, tutorialId],
  );

  const generateNextInteractiveStep = useCallback(async () => {
    if (!interactiveGenerator || isGeneratingInteractiveStep) return;
    setIsGeneratingInteractiveStep(true);
    try {
      const before = interactiveStepsLenRef.current;
      await interactiveGenerator();
      const after = interactiveStepsLenRef.current;
      // If no step was produced, do NOT auto-exit. The generator might have failed
      // transiently (model formatting, network) and the user should be able to try again.
      if (after <= before) return;
      // Jump is scheduled inside addInteractiveStep when a new step is appended.
    } finally {
      setIsGeneratingInteractiveStep(false);
    }
  }, [interactiveGenerator, isGeneratingInteractiveStep]);

  const exitTutorial = useCallback(() => {
    setTutorialId(null);
    setTutorialChatOverride(null);
  }, []);

  // Auto-clear the chat-answer overlay whenever the user moves to a different
  // step. This way navigating Back/Next during a tutorial always brings them
  // back to the original tutorial content, not their old Q&A answer.
  const currentStepIdForCleanup = (() => {
    if (tutorialId === INTERACTIVE_TUTORIAL_ID) {
      const len = interactiveSteps.length;
      if (!len) return null;
      const idx = Math.min(Math.max(currentStepIndex, 0), len - 1);
      return interactiveSteps[idx]?.id ?? null;
    }
    if (!tutorialId) return null;
    const tut = getTutorialById(tutorialId);
    if (!tut?.steps.length) return null;
    const idx = Math.min(Math.max(currentStepIndex, 0), tut.steps.length - 1);
    return tut.steps[idx]?.id ?? null;
  })();
  useEffect(() => {
    if (!tutorialChatOverride) return;
    if (tutorialChatOverride.stepId !== currentStepIdForCleanup) {
      setTutorialChatOverride(null);
    }
  }, [currentStepIdForCleanup, tutorialChatOverride]);

  const nextStep = useCallback(() => {
    setCurrentStepIndex((i) => {
      if (tutorialId === INTERACTIVE_TUTORIAL_ID) {
        const max = Math.max(0, interactiveSteps.length - 1);
        return Math.min(i + 1, max);
      }
      const t = tutorialId ? getTutorialById(tutorialId) : undefined;
      const max = (t?.steps.length ?? 1) - 1;
      return Math.min(i + 1, max);
    });
  }, [interactiveSteps.length, tutorialId]);

  const previousStep = useCallback(() => {
    setCurrentStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const value = useMemo(
    (): TutorialContextValue => ({
      tutorialId,
      currentStepIndex: safeStepIndex,
      interactiveGoal: tutorialId === INTERACTIVE_TUTORIAL_ID ? interactiveGoal : "",
      activeTutorial,
      currentStep,
      startTutorial,
      startInteractiveTutorial,
      addInteractiveStep,
      replaceInteractiveStepAt,
      registerInteractiveNextStepGenerator,
      registerInteractivePromptHandler,
      sendInteractivePrompt,
      generateNextInteractiveStep,
      isGeneratingInteractiveStep,
      tutorialChatOverride,
      askTutorialQuestion,
      isAskingTutorialQuestion,
      clearTutorialChatOverride,
      exitTutorial,
      nextStep,
      previousStep,
      canGoNext,
      canGoPrevious,
      isFirstStep,
      isLastStep,
    }),
    [
      tutorialId,
      safeStepIndex,
      interactiveGoal,
      activeTutorial,
      currentStep,
      startTutorial,
      startInteractiveTutorial,
      addInteractiveStep,
      replaceInteractiveStepAt,
      registerInteractiveNextStepGenerator,
      registerInteractivePromptHandler,
      sendInteractivePrompt,
      generateNextInteractiveStep,
      isGeneratingInteractiveStep,
      tutorialChatOverride,
      askTutorialQuestion,
      isAskingTutorialQuestion,
      clearTutorialChatOverride,
      exitTutorial,
      nextStep,
      previousStep,
      canGoNext,
      canGoPrevious,
      isFirstStep,
      isLastStep,
    ],
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error("useTutorial must be used within TutorialProvider");
  }
  return ctx;
}
