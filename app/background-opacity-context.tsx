"use client";

import { createContext, useContext, useEffect, useState } from "react";

const DEFAULT_BACKGROUND_OPACITY = 0.8;
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
  // Always start at the default on every fresh load — we intentionally do not
  // restore from localStorage so Low (0.8) is the default each time the app opens.
  const [backgroundOpacity, setBackgroundOpacityState] = useState<number>(DEFAULT_BACKGROUND_OPACITY);

  const setBackgroundOpacity = (value: number) => {
    setBackgroundOpacityState(clampOpacity(value));
  };

  useEffect(() => {
    document.documentElement.style.setProperty("--shell-bg-opacity", String(backgroundOpacity));
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
