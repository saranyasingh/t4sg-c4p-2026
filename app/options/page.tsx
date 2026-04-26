"use client";

import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";
import { useAudioMode } from "../audio-mode-context";
import { useBackgroundOpacity } from "../background-opacity-context";
import { LanguageSelector } from "../language-selector";
import { TEXT_SIZE_PRESETS, useTextSize } from "../text-size-context";
import { SettingsSlider } from "./settings-slider";

const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==";

export default function Settings() {
  const { t } = useTranslation();
  const { audioModeEnabled, setAudioModeEnabled } = useAudioMode();
  const { backgroundOpacity, setBackgroundOpacity } = useBackgroundOpacity();
  const { scale, setScale } = useTextSize();
  const selectedSizeIndex = TEXT_SIZE_PRESETS.findIndex((preset) => preset === scale);
  const backgroundOpacityPercent = Math.round(backgroundOpacity * 100);

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
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <TypographyP className="font-semibold text-white">{t("languageSelector.label")}</TypographyP>
            <LanguageSelector />
          </div>

          <div className="space-y-3">
            <TypographyP className="font-semibold text-white">{t("options.assistantSpeaksHeading")}</TypographyP>
            <Button
              type="button"
              variant={audioModeEnabled ? "default" : "outline"}
              data-intro="audio-mode"
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

        <SettingsSlider
          heading={t("options.textSizeHeading")}
          ariaLabel={t("options.textSizeSliderAria")}
          min={0}
          max={TEXT_SIZE_PRESETS.length - 1}
          step={1}
          value={selectedSizeIndex >= 0 ? selectedSizeIndex : 0}
          onChange={(index) => {
            const nextScale = TEXT_SIZE_PRESETS[index];
            if (nextScale !== undefined) {
              setScale(nextScale);
            }
          }}
          marks={textSizeLabels}
        />

        <SettingsSlider
          heading={t("options.backgroundOpacityHeading")}
          ariaLabel={t("options.backgroundOpacitySliderAria")}
          min={80}
          max={100}
          step={1}
          value={backgroundOpacityPercent}
          onChange={(percent) => setBackgroundOpacity(percent / 100)}
          marks={["80%", "90%", "100%"]}
        />
      </div>
    </div>
  );
}
