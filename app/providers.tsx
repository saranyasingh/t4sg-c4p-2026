"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nLangSync />
      {children}
    </ThemeProvider>
  );
}
