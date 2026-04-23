"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/app/language-selector";
import { InteractiveTutorialChat } from "./interactive-tutorial-chat";

export default function InteractiveTutorialPage() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline" className="interactable border-white/30 bg-black/40 text-white">
          <Link href="/tutorials">{t("tutorials.backToTutorials")}</Link>
        </Button>
        <LanguageSelector />
      </div>
      <InteractiveTutorialChat />
    </div>
  );
}
