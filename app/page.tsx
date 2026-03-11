"use client";

import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";
import ScreenshotButton from "./screenshot-button";
import { useState } from "react";
import BoundingBoxOverlay from "./bounding-box-overlay";

export default function Home() {
  const { t } = useTranslation();
  const [coords, setCoords] = useState<Coordinates | null>(null);

  return (
    <div className="space-y-4">
      <TypographyH2>{t("home.welcome")}</TypographyH2>
      <TypographyP>{t("home.getStarted")}</TypographyP>
      <div className="space-y-4">
      <ScreenshotButton onCoordinates={setCoords} />
      {coords && (
        <pre className="text-xs text-white">{JSON.stringify(coords, null, 2)}</pre>
      )}
      <BoundingBoxOverlay coords={coords} />
    </div>
  );
}
