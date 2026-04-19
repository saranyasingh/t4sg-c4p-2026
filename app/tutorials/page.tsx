"use client";

import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { INTERACTIVE_AI_TUTORIAL_ROUTE } from "@/lib/tutorials";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "../language-selector";

export default function TutorialsLandingPage() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex justify-end">
        <LanguageSelector />
      </div>
      <TypographyH2>{t("nav.tutorials")}</TypographyH2>
      <TypographyP className="text-white/80">{t("tutorials.landingDescription")}</TypographyP>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button asChild className="interactable w-fit bg-white text-black hover:bg-white/90">
          <Link href={INTERACTIVE_AI_TUTORIAL_ROUTE}>{t("tutorials.interactiveAiButton")}</Link>
        </Button>
        <TypographyP className="text-xs text-white/60 sm:max-w-md">{t("tutorials.interactiveAiHint")}</TypographyP>
      </div>
      <Button asChild variant="outline" className="interactable w-fit border-white/30">
        <Link href="/">{t("tutorials.backToHome")}</Link>
      </Button>
    </div>
  );
}
