"use client";

import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { INTERACTIVE_AI_TUTORIAL_ROUTE, TUTORIALS } from "@/lib/tutorials";
import { BookOpen } from "lucide-react";
import Link from "next/link";
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

        <div className="mt-2 rounded-xl border border-white/15 bg-white/5 p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/60">
            <BookOpen className="h-3.5 w-3.5" />
            {t("home.tutorialsHeading")}
          </h3>
          <div className="flex flex-col gap-1">
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
                  {t(`tutorial.courseTitles.${tutorial.id}`, { defaultValue: tutorial.title })}
                </Button>
              );
            })}
            <Button
              asChild
              className="interactable mt-1 w-full justify-center bg-white text-black hover:bg-white/90"
            >
              <Link href={INTERACTIVE_AI_TUTORIAL_ROUTE}>{t("tutorials.interactiveAiButton")}</Link>
            </Button>
            <TypographyP className="text-[11px] leading-snug text-white/55">
              {t("tutorials.interactiveAiHint")}
            </TypographyP>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Chat showHeader={false} />
      </div>
    </div>
  );
}
