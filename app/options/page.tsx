"use client";

import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";
import { useAudioMode } from "../audio-mode-context";
import { LanguageSelector } from "../language-selector";
import { TEXT_SIZE_PRESETS, useTextSize } from "../text-size-context";

const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==";

export default function Settings() {
  const { t } = useTranslation();
  const { audioModeEnabled, setAudioModeEnabled } = useAudioMode();
  const { scale, setScale } = useTextSize();
  const selectedSizeIndex = TEXT_SIZE_PRESETS.findIndex((preset) => preset === scale);

  const textSizeLabels = [
    t("options.textSizeSmall"),
    t("options.textSizeMedium"),
    t("options.textSizeLarge"),
    t("options.textSizeExtraLarge"),
  ];

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="shrink-0 space-y-2">
        <TypographyH2>{t("options.heading")}</TypographyH2>
        <TypographyP className="text-white/80">{t("options.description")}</TypographyP>
      </div>

      <div className="flex flex-col gap-8">
        <div className="space-y-3">
          <TypographyP className="font-semibold text-white">
            {`${t("options.textSizeHeading")} (${t("options.textSizeCurrent", { size: textSizeLabels[selectedSizeIndex >= 0 ? selectedSizeIndex : 0] })})`}
          </TypographyP>
          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={TEXT_SIZE_PRESETS.length - 1}
              step={1}
              value={selectedSizeIndex >= 0 ? selectedSizeIndex : 0}
              onChange={(event) => {
                const index = Number(event.currentTarget.value);
                const nextScale = TEXT_SIZE_PRESETS[index];
                if (nextScale !== undefined) {
                  setScale(nextScale);
                }
              }}
              className="text-size-slider w-full"
              aria-label={t("options.textSizeSliderAria")}
            />
            <div className="grid grid-cols-4 text-center text-xs text-white/75">
              {textSizeLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <TypographyP className="font-semibold text-white">{t("languageSelector.label")}</TypographyP>
          <LanguageSelector />
        </div>

        <div className="space-y-3">
          <TypographyP className="font-semibold text-white">{t("chat.heading")}</TypographyP>
          <Button
            type="button"
            variant={audioModeEnabled ? "default" : "outline"}
            className={
              audioModeEnabled
                ? "interactable !text-white ring-2 ring-primary/40 hover:!text-white"
                : "interactable !text-white hover:!text-white"
            }
            aria-pressed={audioModeEnabled}
            onClick={() => {
              const next = !audioModeEnabled;
              if (next) {
                const unlock = new Audio(SILENT_WAV);
                unlock.volume = 0.01;
                void unlock.play().catch(() => {
                  /* ignore */
                });
              }
              setAudioModeEnabled(next);
            }}
          >
            {audioModeEnabled ? t("chat.audioModeOn") : t("chat.audioModeOff")}
          </Button>
        </div>
      </div>
    </div>
  );
}
