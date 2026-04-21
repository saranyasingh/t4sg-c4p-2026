"use client";

import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";
import { Chat } from "./chat/chat";

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-3 px-6">
        <TypographyH2>{t("home.brandTitle")}</TypographyH2>
        <TypographyP>{t("home.getStarted")}</TypographyP>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Chat showHeader={false} />
      </div>
    </div>
  );
}