"use client";

import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { TUTORIALS } from "@/lib/tutorials";
import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Chat } from "./chat/chat";
import { LanguageSelector } from "./language-selector";
import { useTutorial } from "./tutorial/tutorial-provider";

export default function Home() {
  const { t } = useTranslation();
  const { tutorialId, startTutorial } = useTutorial();

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex shrink-0 items-center justify-end px-6 pt-6">
        <LanguageSelector />
      </div>

      <div className="shrink-0 space-y-3 px-6">
        <TypographyH2>{t("home.brandTitle")}</TypographyH2>
        <TypographyP>{t("home.getStarted")}</TypographyP>

        <div className="flex flex-col gap-1.5 pt-1">
          {TUTORIALS.map((tutorial) => {
            const isActive = tutorialId === tutorial.id;
            return (
              <Button
                key={tutorial.id}
                type="button"
                variant="ghost"
                className={`interactable flex h-auto items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
                onClick={() => startTutorial(tutorial.id)}
              >
                
                <BookOpen className="h-4 w-4 shrink-0" />
                {t(`tutorial.courseTitles.${tutorial.id}`, { defaultValue: tutorial.title })}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Chat showHeader={false} />
      </div>
    </div>
  );
}
