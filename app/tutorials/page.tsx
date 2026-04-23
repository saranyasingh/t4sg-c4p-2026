"use client";

import { TutorialCard } from "@/app/tutorials/tutorial-card";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { INTERACTIVE_AI_TUTORIAL_ROUTE } from "@/lib/tutorials";
import Link from "next/link";
import { TUTORIALS } from "@/lib/tutorials";
import { useTranslation } from "react-i18next";
import { useTutorial } from "../tutorial/tutorial-provider";

export default function TutorialsLandingPage() {
  const { t } = useTranslation();
  const { startTutorial } = useTutorial();

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <div className="shrink-0 space-y-2">
        <TypographyH2>{t("nav.tutorials")}</TypographyH2>
        <TypographyP className="text-white/80">{t("tutorials.description")}</TypographyP>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-4 pb-2 md:grid-cols-2">
          {TUTORIALS.map((tutorial) => {
            const title = t(`tutorial.courseTitles.${tutorial.id}`, {
              defaultValue: tutorial.id === "gmail" ? "Gmail" : t(tutorial.title),
            });

            return (
              <TutorialCard
                key={tutorial.id}
                ctaLabel={t("tutorials.startTutorial")}
                title={title}
                onClick={() => startTutorial(tutorial.id)}
              />
            );
          })}
        </div>
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
