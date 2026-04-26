"use client";

import { TutorialCard } from "@/app/tutorials/tutorial-card";
import { TypographyH2, TypographyLarge, TypographyP, TypographySmall } from "@/components/ui/typography";
import { TUTORIALS } from "@/lib/tutorials";
import Link from "next/link";
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
          <Link
            href="/tutorials/interactive"
            className="interactable flex h-auto min-h-36 flex-col items-start justify-between rounded-2xl border border-white/15 bg-white/5 p-5 text-left text-white transition-colors hover:border-white/30 hover:bg-white/10"
          >
            <div className="space-y-2">
              <TypographyLarge className="leading-tight text-white">
                {t("tutorials.interactiveTitle", { defaultValue: "Interactive tutorial (beta)" })}
              </TypographyLarge>
            </div>
            <TypographySmall className="mt-6 text-white/75">
              {t("tutorials.interactiveCta", { defaultValue: "Start" })}
            </TypographySmall>
          </Link>
        </div>
      </div>
    </div>
  );
}
