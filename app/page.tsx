"use client";

import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { INTRO_TUTORIAL_ID, TUTORIALS } from "@/lib/tutorials";
import { BookOpen, HelpCircle, Languages, MessageSquare, Mic, Monitor } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Chat } from "./chat/chat";

export default function Home() {
  const { t } = useTranslation();
  const { tutorialId, startTutorial } = useTutorial();
  const [hasEnteredApp, setHasEnteredApp] = useState(false);

  const features: { icon: typeof MessageSquare; titleKey: string; bodyKey: string }[] = [
    { icon: MessageSquare, titleKey: "home.features.chat.title", bodyKey: "home.features.chat.body" },
    { icon: Monitor, titleKey: "home.features.screen.title", bodyKey: "home.features.screen.body" },
    { icon: Mic, titleKey: "home.features.voice.title", bodyKey: "home.features.voice.body" },
    { icon: Languages, titleKey: "home.features.language.title", bodyKey: "home.features.language.body" },
    { icon: BookOpen, titleKey: "home.features.tutorials.title", bodyKey: "home.features.tutorials.body" },
    { icon: HelpCircle, titleKey: "home.features.help.title", bodyKey: "home.features.help.body" },
  ];

  return (
    <div className="interactable flex min-h-full flex-col">
      <div className="interactable mb-4 flex shrink-0 items-center justify-end px-6 pt-12">
        <LanguageSelector />
      </div>

      {!hasEnteredApp ? (
        <div className="interactable shrink-0 space-y-4 px-6 pb-6">
          <TypographyH2>{t("home.brandTitle")}</TypographyH2>
          <TypographyP className="text-sm text-white/80">{t("home.tagline")}</TypographyP>
          <div className="interactable mt-2 rounded-xl border border-white/15 bg-white/5 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              {t("home.featuresHeading")}
            </h3>
            <ul className="flex flex-col gap-2">
              {features.map(({ icon: Icon, titleKey, bodyKey }) => (
                <li key={titleKey} className="flex gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-white/75" aria-hidden="true" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold leading-snug text-white">{t(titleKey)}</p>
                    <p className="text-xs leading-snug text-white/70">{t(bodyKey)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <Button
            type="button"
            className="interactable w-full bg-white text-black hover:bg-white/90"
            onClick={() => setHasEnteredApp(true)}
          >
            {t("home.letsGetStarted")}
          </Button>
        </div>
      ) : (
        <>
          <div className="interactable shrink-0 space-y-3 px-6 pb-4">
            <TypographyH2>{t("home.brandTitle")}</TypographyH2>
            <TypographyP className="text-sm text-white/80">{t("home.tagline")}</TypographyP>

    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-3 px-6">
        <TypographyH2>{t("home.brandTitle")}</TypographyH2>
        <TypographyP>{t("home.getStarted")}</TypographyP>
      </div>

            <Button
              type="button"
              className="interactable w-full justify-start gap-2 bg-white text-black hover:bg-white/90"
              onClick={() => startTutorial(INTRO_TUTORIAL_ID)}
            >
              <HelpCircle className="h-4 w-4" />
              {t("home.startIntroCta")}
            </Button>

            <div className="interactable mt-2 rounded-xl border border-white/15 bg-white/5 p-3" data-intro="tutorials">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/60">
                <BookOpen className="h-3.5 w-3.5" />
                {t("home.tutorialsHeading")}
              </h3>
              <div className="flex flex-col gap-1">
                {TUTORIALS.filter((tutorial) => tutorial.id !== INTRO_TUTORIAL_ID).map((tutorial) => {
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
              </div>
            </div>
          </div>

          <div className="interactable flex min-h-[240px] flex-1 overflow-hidden">
            <Chat showHeader={false} />
          </div>
        </>
      )}
    </div>
  );
}
