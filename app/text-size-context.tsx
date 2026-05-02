"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const TEXT_SIZE_PRESETS = [1, 1.25, 1.5, 1.75] as const;
export type TextSizeScale = (typeof TEXT_SIZE_PRESETS)[number];

const DEFAULT_TEXT_SIZE_SCALE: TextSizeScale = 1.5;

interface TextSizeContextType {
  scale: TextSizeScale;
  setScale: (scale: TextSizeScale) => void;
}

const TextSizeContext = createContext<TextSizeContextType | undefined>(undefined);

export function TextSizeProvider({ children }: { children: React.ReactNode }) {
  // Always start at the default on every fresh load — we intentionally do not
  // restore from localStorage. Large is the default for readability.
  const [scale, setScale] = useState<TextSizeScale>(DEFAULT_TEXT_SIZE_SCALE);

  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(scale));
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
