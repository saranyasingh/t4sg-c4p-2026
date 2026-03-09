"use client";

import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";
import ScreenshotButton from "./screenshot-button";

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <TypographyH2>{t("home.welcome")}</TypographyH2>
      <TypographyP>{t("home.getStarted")}</TypographyP>
      <ScreenshotButton />
    </div>
  );
}
