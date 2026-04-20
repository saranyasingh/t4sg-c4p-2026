"use client";

import { createContext, useContext, useEffect, useState } from "react";

const BACKGROUND_OPACITY_STORAGE_KEY = "background-opacity";
const DEFAULT_BACKGROUND_OPACITY = 1;
const MIN_BACKGROUND_OPACITY = 0.8;
const MAX_BACKGROUND_OPACITY = 1;

interface BackgroundOpacityContextType {
  backgroundOpacity: number;
  setBackgroundOpacity: (value: number) => void;
}

const BackgroundOpacityContext = createContext<BackgroundOpacityContextType | undefined>(undefined);

function clampOpacity(value: number) {
  return Math.min(MAX_BACKGROUND_OPACITY, Math.max(MIN_BACKGROUND_OPACITY, value));
}

export function BackgroundOpacityProvider({ children }: { children: React.ReactNode }) {
  const [backgroundOpacity, setBackgroundOpacityState] = useState<number>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_BACKGROUND_OPACITY;
    }

    const stored = Number(window.localStorage.getItem(BACKGROUND_OPACITY_STORAGE_KEY));
    if (!Number.isFinite(stored)) {
      return DEFAULT_BACKGROUND_OPACITY;
    }

    return clampOpacity(stored);
  });

  const setBackgroundOpacity = (value: number) => {
    setBackgroundOpacityState(clampOpacity(value));
  };

  useEffect(() => {
    document.documentElement.style.setProperty("--shell-bg-opacity", String(backgroundOpacity));
    window.localStorage.setItem(BACKGROUND_OPACITY_STORAGE_KEY, String(backgroundOpacity));
  }, [backgroundOpacity]);

  return (
    <BackgroundOpacityContext.Provider value={{ backgroundOpacity, setBackgroundOpacity }}>
      {children}
    </BackgroundOpacityContext.Provider>
  );
}

export function useBackgroundOpacity() {
  const context = useContext(BackgroundOpacityContext);
  if (!context) {
    throw new Error("useBackgroundOpacity must be used within BackgroundOpacityProvider");
  }
  return context;
}
