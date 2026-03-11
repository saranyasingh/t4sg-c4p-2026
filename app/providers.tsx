"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import i18n from "./i18n";

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
    <ThemeProvider>
      <I18nLangSync />
      <I18nKeyedContent>{children}</I18nKeyedContent>
    </ThemeProvider>
  );
}
