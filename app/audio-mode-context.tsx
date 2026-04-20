"use client";

import { createContext, useContext, useState } from "react";

interface AudioModeContextType {
  audioModeEnabled: boolean;
  setAudioModeEnabled: (enabled: boolean) => void;
}

const AudioModeContext = createContext<AudioModeContextType | undefined>(undefined);

export function AudioModeProvider({ children }: { children: React.ReactNode }) {
  const [audioModeEnabled, setAudioModeEnabled] = useState(true);

  return (
    <AudioModeContext.Provider value={{ audioModeEnabled, setAudioModeEnabled }}>
      {children}
    </AudioModeContext.Provider>
  );
}

export function useAudioMode() {
  const context = useContext(AudioModeContext);
  if (!context) {
    throw new Error("useAudioMode must be used within AudioModeProvider");
  }
  return context;
}
