"use client";

import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import BoundingBoxOverlay from "./bounding-box-overlay";
import { Chat } from "./chat/chat";
import { LanguageSelector } from "./language-selector";
import type { Coordinates } from "./screenshot-button";
import ScreenshotButton from "./screenshot-button";

export default function Home() {
  const { t } = useTranslation();
  const [coords, setCoords] = useState<Coordinates | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex shrink-0 items-center justify-between px-6 pt-6">
        <LanguageSelector />
        <ScreenshotButton onCoordinates={setCoords} />
      </div>

      <div className="shrink-0 space-y-2 px-6">
        <TypographyH2>Granson AI</TypographyH2>
        <TypographyP>{t("home.getStarted")}</TypographyP>
        {coords && <pre className="text-xs text-white">{JSON.stringify(coords, null, 2)}</pre>}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Chat showHeader={false} />
      </div>
      <BoundingBoxOverlay coords={coords} />
    </div>
  );
}
