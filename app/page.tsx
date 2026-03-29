"use client";

import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { TUTORIALS } from "@/lib/tutorials";
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
        <TypographyH2>Granson AI</TypographyH2>
        <TypographyP>{t("home.getStarted")}</TypographyP>
        <div className="flex flex-wrap gap-2">
          {TUTORIALS.map((tutorial) => {
            const isActive = tutorialId === tutorial.id;
            return (
              <Button
                key={tutorial.id}
                type="button"
                variant={isActive ? "default" : "outline"}
                className="interactable"
                onClick={() => startTutorial(tutorial.id)}
              >
                {tutorial.title}
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
