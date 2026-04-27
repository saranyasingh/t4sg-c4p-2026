"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const TEXT_SIZE_PRESETS = [1, 1.25, 1.5, 1.75] as const;
export type TextSizeScale = (typeof TEXT_SIZE_PRESETS)[number];

const TEXT_SIZE_STORAGE_KEY = "text-size-scale";
const DEFAULT_TEXT_SIZE_SCALE: TextSizeScale = 1;

interface TextSizeContextType {
  scale: TextSizeScale;
  setScale: (scale: TextSizeScale) => void;
}

const TextSizeContext = createContext<TextSizeContextType | undefined>(undefined);

function isTextSizeScale(value: number): value is TextSizeScale {
  return TEXT_SIZE_PRESETS.includes(value as TextSizeScale);
}

export function TextSizeProvider({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState<TextSizeScale>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_TEXT_SIZE_SCALE;
    }

    const stored = Number(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY));
    return isTextSizeScale(stored) ? stored : DEFAULT_TEXT_SIZE_SCALE;
  });

  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(scale));
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, String(scale));
  }, [scale]);

  return <TextSizeContext.Provider value={{ scale, setScale }}>{children}</TextSizeContext.Provider>;
}

export function useTextSize() {
  const context = useContext(TextSizeContext);
  if (!context) {
    throw new Error("useTextSize must be used within TextSizeProvider");
  }
  return context;
}
