"use client";

import { getTutorialById, type Tutorial, type TutorialStep } from "@/lib/tutorials";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type TutorialContextValue = {
  /** `tutorialId !== null` means a tutorial is active (tutorial “mode”). */
  tutorialId: string | null;
  currentStepIndex: number;
  activeTutorial: Tutorial | null;
  currentStep: TutorialStep | null;
  startTutorial: (id: string) => void;
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

  const activeTutorial = tutorialId ? getTutorialById(tutorialId) ?? null : null;
  const steps = activeTutorial?.steps ?? [];
  const lastIndex = Math.max(0, steps.length - 1);
  const safeStepIndex = steps.length ? Math.min(currentStepIndex, lastIndex) : 0;
  const currentStep = steps[safeStepIndex] ?? null;

  const isFirstStep = safeStepIndex <= 0;
  const isLastStep = steps.length > 0 && safeStepIndex >= lastIndex;
  const canGoNext = Boolean(activeTutorial && !isLastStep);
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

  const exitTutorial = useCallback(() => {
    setTutorialId(null);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStepIndex((i) => {
      const t = tutorialId ? getTutorialById(tutorialId) : undefined;
      const max = (t?.steps.length ?? 1) - 1;
      return Math.min(i + 1, max);
    });
  }, [tutorialId]);

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
