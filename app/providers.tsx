"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AudioModeProvider } from "./audio-mode-context";
import { BackgroundOpacityProvider } from "./background-opacity-context";
import "./i18n";
import i18n from "./i18n";
import { LandingProvider } from "./landing-context";
import { TextSizeProvider } from "./text-size-context";
import { TutorialProvider } from "./tutorial/tutorial-provider";

function I18nLangSync() {
  useEffect(() => {
    const updateLang = () => {
      const lng = i18n.language?.split("-")[0] ?? "en";
      const lang = lng === "es" ? "es" : "en";
      if (typeof document !== "undefined" && document.documentElement.lang !== lang) {
        document.documentElement.lang = lang;
      }
    };
    updateLang();
    i18n.on("languageChanged", updateLang);
    return () => i18n.off("languageChanged", updateLang);
  }, []);
  return null;
}

/** Remounts all content when language changes so only one language is ever visible (no overlay). */
function I18nKeyedContent({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const lng = i18n.language?.split("-")[0] ?? "en";
  const langKey = lng === "es" ? "es" : "en";
  return <div key={langKey}>{children}</div>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TextSizeProvider>
      <BackgroundOpacityProvider>
        <AudioModeProvider>
          <LandingProvider>
            <ThemeProvider forcedTheme="light" enableSystem={false}>
              <I18nLangSync />
              <TutorialProvider>
                <I18nKeyedContent>{children}</I18nKeyedContent>
              </TutorialProvider>
            </ThemeProvider>
          </LandingProvider>
        </AudioModeProvider>
      </BackgroundOpacityProvider>
    </TextSizeProvider>
  );
}
