"use client";

import { createContext, useContext, useEffect } from "react";

// Global text scale multiplier (1 = normal, 1.25 = 25% larger, 0.9 = 10% smaller)
// Later this can be replaced by state connected to a settings control.
const TEXT_SIZE_SCALE = 1;

interface TextSizeContextType {
  scale: number;
}

const TextSizeContext = createContext<TextSizeContextType | undefined>(undefined);

export function TextSizeProvider({ children }: { children: React.ReactNode }) {
  const value: TextSizeContextType = {
    scale: TEXT_SIZE_SCALE,
  };

  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(value.scale));
  }, [value.scale]);

  return <TextSizeContext.Provider value={value}>{children}</TextSizeContext.Provider>;
}

export function useTextSize() {
  const context = useContext(TextSizeContext);
  if (!context) {
    throw new Error("useTextSize must be used within TextSizeProvider");
  }
  return context;
}
