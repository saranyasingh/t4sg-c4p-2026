"use client";

import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
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
      <Button asChild className="interactable w-fit">
        <Link href="/">{t("tutorials.backToHome")}</Link>
      </Button>
    </div>
  );
}
