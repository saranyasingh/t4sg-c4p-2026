"use client";

import { TutorialCard } from "@/app/tutorials/tutorial-card";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
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
    </div>
  );
}
