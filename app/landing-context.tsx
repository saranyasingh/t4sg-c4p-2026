"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface LandingContextType {
  hasEnteredApp: boolean;
  enterApp: () => void;
}

const LandingContext = createContext<LandingContextType | undefined>(undefined);

export function LandingProvider({ children }: { children: React.ReactNode }) {
  // We don't persist this — the landing should show every time the app
  // loads, so first-time users get the welcome screen on every fresh
  // launch. State lives only in memory and resets on reload.
  const [hasEnteredApp, setHasEnteredApp] = useState(false);

  const enterApp = useCallback(() => {
    setHasEnteredApp(true);
  }, []);

  return <LandingContext.Provider value={{ hasEnteredApp, enterApp }}>{children}</LandingContext.Provider>;
}

export function useLanding() {
  const context = useContext(LandingContext);
  if (!context) {
    throw new Error("useLanding must be used within LandingProvider");
  }
  return context;
}
