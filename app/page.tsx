"use client";

import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { INTRO_TUTORIAL_ID } from "@/lib/tutorials";
import { BookOpen, Check, HelpCircle, Languages, MessageSquare, Mic, Monitor } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useBackgroundOpacity } from "./background-opacity-context";
import { Chat } from "./chat/chat";
import { useLanding } from "./landing-context";
import { TEXT_SIZE_PRESETS, useTextSize, type TextSizeScale } from "./text-size-context";
import { useTutorial } from "./tutorial/tutorial-provider";

const OPACITY_PRESETS: { value: number; labelKey: string }[] = [
  { value: 0.8, labelKey: "home.opacityLow" },
  { value: 0.9, labelKey: "home.opacityMedium" },
  { value: 1, labelKey: "home.opacityFull" },
];

const TEXT_SIZE_LABEL_KEYS: Record<TextSizeScale, string> = {
  1: "options.textSizeSmall",
  1.25: "options.textSizeMedium",
  1.5: "options.textSizeLarge",
  1.75: "options.textSizeExtraLarge",
};

// Tailwind utility classes that scale with the --text-scale CSS variable. Using
// these instead of plain text-xs/text-sm/text-base ensures the landing page
// reflects the user's chosen text size in real time.
const TEXT_XS = "text-[calc(0.75rem*var(--text-scale))]";
const TEXT_SM = "text-[calc(0.875rem*var(--text-scale))]";
const TEXT_BASE = "text-[calc(1rem*var(--text-scale))]";

type ScreenCaptureStatus = "unknown" | "requesting" | "granted" | "denied";

export default function Home() {
  const { t, i18n } = useTranslation();
  const { startTutorial } = useTutorial();
  const { backgroundOpacity, setBackgroundOpacity } = useBackgroundOpacity();
  const { scale, setScale } = useTextSize();
  const { hasEnteredApp, enterApp } = useLanding();
  const [screenCaptureStatus, setScreenCaptureStatus] = useState<ScreenCaptureStatus>("unknown");

  // Dismiss the landing screen and kick off the intro tour. We wait a beat
  // so that the shell panel and the chat (which contain the highlighted
  // tour targets) have a chance to mount before the first highlight tries
  // to position itself.
  const handleEnterApp = () => {
    enterApp();
    window.setTimeout(() => {
      startTutorial(INTRO_TUTORIAL_ID);
    }, 350);
  };

  const currentLng = i18n.language?.split("-")[0] === "es" ? "es" : "en";

  const handleRequestScreenCapture = async () => {
    if (typeof window === "undefined" || !window.electronAPI) {
      // Outside Electron there is no system-level permission to grant.
      setScreenCaptureStatus("granted");
      return;
    }
    setScreenCaptureStatus("requesting");
    try {
      const granted = await window.electronAPI.requestScreenshotPermission();
      setScreenCaptureStatus(granted ? "granted" : "denied");
    } catch {
      setScreenCaptureStatus("denied");
    }
  };

  const features: { icon: typeof MessageSquare; titleKey: string; bodyKey: string }[] = [
    { icon: MessageSquare, titleKey: "home.features.chat.title", bodyKey: "home.features.chat.body" },
    { icon: Monitor, titleKey: "home.features.screen.title", bodyKey: "home.features.screen.body" },
    { icon: Mic, titleKey: "home.features.voice.title", bodyKey: "home.features.voice.body" },
    { icon: Languages, titleKey: "home.features.language.title", bodyKey: "home.features.language.body" },
    { icon: BookOpen, titleKey: "home.features.tutorials.title", bodyKey: "home.features.tutorials.body" },
    { icon: HelpCircle, titleKey: "home.features.help.title", bodyKey: "home.features.help.body" },
  ];

  // The home view inside the shell panel is just the brand heading and the
  // chat — language and audio-mode toggles live on the Options tab now.
  const appBody = (
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

  if (hasEnteredApp) {
    return appBody;
  }

  // Full-screen landing. The whole viewport is taken over by the welcome
  // screen until the user clicks "Let's get started" — the shell panel does
  // not render until that happens (see ShellLayout). The background uses the
  // same opacity variable as the shell so the user can preview their choice.
  const presetButtonClass = (active: boolean) =>
    `interactable rounded-lg border px-3 py-2 ${TEXT_SM} font-semibold outline-none focus:outline-none ${
      active
        ? "border-white bg-white text-black shadow"
        : "border-white/30 bg-white/5 text-white hover:bg-white/15"
    }`;

  // Strip focus from the button immediately after a click so the previous
  // selection doesn't visually linger via the browser's focus styling on
  // the just-clicked button.
  const blurOnClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
  };

  const screenCaptureLabelKey =
    screenCaptureStatus === "requesting"
      ? "home.screenCaptureRequesting"
      : screenCaptureStatus === "granted"
        ? "home.screenCaptureGranted"
        : "home.screenCaptureAllow";

  const overlay = (
    <div
      className="interactable fixed inset-0 z-[2000000] flex flex-col overflow-y-auto bg-[hsl(var(--foreground)/var(--shell-bg-opacity))] text-white backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="landing-title"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 sm:px-10 sm:py-10">
        <header className="space-y-1 text-center">
          <p className={`${TEXT_XS} font-semibold uppercase tracking-wide text-white/60`}>
            {t("home.welcome")}
          </p>
          <TypographyH2 id="landing-title" className="!mt-0 !border-0 !pb-0 text-center text-white">
            {t("home.brandTitle")}
          </TypographyH2>
          <TypographyP className={`!mt-1 text-center ${TEXT_SM} text-white/85`}>
            {t("home.tagline")}
          </TypographyP>
        </header>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left column: preferences */}
          <section className="space-y-4 rounded-xl border border-white/15 bg-white/5 p-4">
            <div className="space-y-1">
              <h3 className={`${TEXT_BASE} font-semibold text-white`}>{t("home.preferencesHeading")}</h3>
              <p className={`${TEXT_XS} text-white/70`}>{t("home.preferencesSubheading")}</p>
            </div>

            <div className="space-y-2">
              <p className={`${TEXT_XS} font-semibold uppercase tracking-wide text-white/65`}>
                {t("home.languageHeading")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={presetButtonClass(currentLng === "en")}
                  aria-pressed={currentLng === "en"}
                  onClick={(e) => {
                    blurOnClick(e);
                    void i18n.changeLanguage("en");
                  }}
                >
                  {t("languageSelector.en")}
                </button>
                <button
                  type="button"
                  className={presetButtonClass(currentLng === "es")}
                  aria-pressed={currentLng === "es"}
                  onClick={(e) => {
                    blurOnClick(e);
                    void i18n.changeLanguage("es");
                  }}
                >
                  {t("languageSelector.es")}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className={`${TEXT_XS} font-semibold uppercase tracking-wide text-white/65`}>
                {t("home.opacityHeading")}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {OPACITY_PRESETS.map((preset) => {
                  // Treat "close enough" as a match so a saved value like 0.92
                  // still selects the 90% preset.
                  const isActive = Math.abs(backgroundOpacity - preset.value) < 0.025;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      className={presetButtonClass(isActive)}
                      aria-pressed={isActive}
                      onClick={(e) => {
                        blurOnClick(e);
                        setBackgroundOpacity(preset.value);
                      }}
                    >
                      {t(preset.labelKey)} ({Math.round(preset.value * 100)}%)
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className={`${TEXT_XS} font-semibold uppercase tracking-wide text-white/65`}>
                {t("home.textSizeHeading")}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {TEXT_SIZE_PRESETS.map((preset) => {
                  const isActive = scale === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      className={presetButtonClass(isActive)}
                      aria-pressed={isActive}
                      onClick={(e) => {
                        blurOnClick(e);
                        setScale(preset);
                      }}
                    >
                      {t(TEXT_SIZE_LABEL_KEYS[preset])}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Right column: screen capture + features */}
          <div className="flex flex-col gap-4">
            <section className="space-y-3 rounded-xl border border-white/15 bg-white/5 p-4">
              <div className="space-y-1">
                <h3 className={`flex items-center gap-2 ${TEXT_BASE} font-semibold text-white`}>
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                  {t("home.screenCaptureHeading")}
                </h3>
                <p className={`${TEXT_XS} leading-relaxed text-white/75`}>{t("home.screenCaptureBody")}</p>
              </div>
              <Button
                type="button"
                disabled={screenCaptureStatus === "requesting" || screenCaptureStatus === "granted"}
                className={`interactable w-full justify-center gap-2 ${TEXT_SM} ${
                  screenCaptureStatus === "granted"
                    ? "bg-emerald-500 text-white hover:bg-emerald-500"
                    : "bg-white text-black hover:bg-white/90"
                }`}
                onClick={() => {
                  void handleRequestScreenCapture();
                }}
              >
                {screenCaptureStatus === "granted" ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                )}
                {t(screenCaptureLabelKey)}
              </Button>
            </section>

            <section className="rounded-xl border border-white/15 bg-white/5 p-4">
              <h3 className={`mb-2 ${TEXT_XS} font-semibold uppercase tracking-wide text-white/60`}>
                {t("home.featuresHeading")}
              </h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {features.map(({ icon: Icon, titleKey, bodyKey }) => (
                  <li key={titleKey} className="flex gap-2">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-white/75" aria-hidden="true" />
                    <div className="min-w-0 space-y-0.5">
                      <p className={`${TEXT_SM} font-semibold leading-snug text-white`}>{t(titleKey)}</p>
                      <p className={`${TEXT_XS} leading-snug text-white/70`}>{t(bodyKey)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <Button
          type="button"
          className={`interactable mt-4 w-full ${TEXT_BASE} bg-white text-black hover:bg-white/90`}
          onClick={handleEnterApp}
        >
          {t("home.letsGetStarted")}
        </Button>
      </div>
    </div>
  );

  // Render the landing inline (its outer div is fixed/full-screen via CSS).
  // Avoiding a portal means SSR and the first client render produce the
  // same markup, so there's no flash of `appBody` before the landing
  // appears. We also don't need `appBody` mounted underneath — the shell
  // remounts the page once the user clicks "Let's get started".
  return overlay;
}
