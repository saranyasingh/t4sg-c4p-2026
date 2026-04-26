"use client";

import { getTutorialById, type Tutorial, type TutorialStep } from "@/lib/tutorials";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const INTERACTIVE_TUTORIAL_ID = "interactive";

export type TutorialContextValue = {
  /** `tutorialId !== null` means a tutorial is active (tutorial “mode”). */
  tutorialId: string | null;
  currentStepIndex: number;
  activeTutorial: Tutorial | null;
  currentStep: TutorialStep | null;
  startTutorial: (id: string) => void;
  startInteractiveTutorial: (goal: string) => void;
  addInteractiveStep: (step: TutorialStep) => void;
  registerInteractiveNextStepGenerator: (fn: (() => Promise<void>) | null) => void;
  generateNextInteractiveStep: () => Promise<void>;
  isGeneratingInteractiveStep: boolean;
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
  const [tutorialId, setTutorialId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const [interactiveGoal, setInteractiveGoal] = useState<string>("");
  const [interactiveSteps, setInteractiveSteps] = useState<TutorialStep[]>([]);
  const [interactiveGenerator, setInteractiveGenerator] = useState<(() => Promise<void>) | null>(null);
  const [isGeneratingInteractiveStep, setIsGeneratingInteractiveStep] = useState(false);
  const interactiveStepsLenRef = useRef(0);

  useEffect(() => {
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

  useEffect(() => {
    if (!activeTutorial || !steps.length) return;
    if (currentStepIndex > lastIndex) {
      setCurrentStepIndex(lastIndex);
    }
  }, [activeTutorial, currentStepIndex, lastIndex, steps.length]);

  const startTutorial = useCallback((id: string) => {
    setTutorialId((prev) => (prev === id ? null : id));
  }, []);

  const startInteractiveTutorial = useCallback((goal: string) => {
    setInteractiveGoal(goal.trim());
    setInteractiveSteps([]);
    setTutorialId(INTERACTIVE_TUTORIAL_ID);
    setCurrentStepIndex(0);
  }, []);

  const addInteractiveStep = useCallback((step: TutorialStep) => {
    setInteractiveSteps((prev) => [...prev, step]);
  }, []);

  const registerInteractiveNextStepGenerator = useCallback((fn: (() => Promise<void>) | null) => {
    setInteractiveGenerator(() => fn);
  }, []);

  const generateNextInteractiveStep = useCallback(async () => {
    if (!interactiveGenerator || isGeneratingInteractiveStep) return;
    setIsGeneratingInteractiveStep(true);
    try {
      const before = interactiveStepsLenRef.current;
      await interactiveGenerator();
      const after = interactiveStepsLenRef.current;
      // If no step was produced, treat that as "we're done".
      if (after <= before) {
        setTutorialId(null);
        return;
      }
      // If a step was appended, advance onto it.
      setCurrentStepIndex((i) => Math.min(i + 1, Math.max(0, after - 1)));
    } finally {
      setIsGeneratingInteractiveStep(false);
    }
  }, [interactiveGenerator, isGeneratingInteractiveStep]);

  const exitTutorial = useCallback(() => {
    setTutorialId(null);
  }, []);

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
      activeTutorial,
      currentStep,
      startTutorial,
      startInteractiveTutorial,
      addInteractiveStep,
      registerInteractiveNextStepGenerator,
      generateNextInteractiveStep,
      isGeneratingInteractiveStep,
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
      activeTutorial,
      currentStep,
      startTutorial,
      startInteractiveTutorial,
      addInteractiveStep,
      registerInteractiveNextStepGenerator,
      generateNextInteractiveStep,
      isGeneratingInteractiveStep,
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
