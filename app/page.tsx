"use client";

import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { INTRO_TUTORIAL_ID } from "@/lib/tutorials";
import { BookOpen, Check, HelpCircle, Languages, MessageSquare, Mic, Monitor } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAudioMode } from "./audio-mode-context";
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
type LandingStep = "welcome" | "language" | "audioMode" | "opacity" | "textSize" | "permissions" | "features";
const LANDING_STEPS: LandingStep[] = ["welcome", "language", "audioMode", "opacity", "textSize", "permissions", "features"];
let landingStepMemory = 0;
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==";

export default function Home() {
  const { t, i18n } = useTranslation();
  const { startTutorial } = useTutorial();
  const { audioModeEnabled, setAudioModeEnabled } = useAudioMode();
  const { backgroundOpacity, setBackgroundOpacity } = useBackgroundOpacity();
  const { scale, setScale } = useTextSize();
  const { hasEnteredApp, enterApp } = useLanding();
  const [screenCaptureStatus, setScreenCaptureStatus] = useState<ScreenCaptureStatus>("unknown");
  const [landingStepIndex, setLandingStepIndex] = useState(() => landingStepMemory);

  // Dismiss the landing screen and kick off the intro tour. We wait a beat
  // so that the shell panel and the chat (which contain the highlighted
  // tour targets) have a chance to mount before the first highlight tries
  // to position itself.
  const handleEnterApp = () => {
    landingStepMemory = 0;
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
  const currentLandingStep = LANDING_STEPS[landingStepIndex];
  const isFirstLandingStep = landingStepIndex === 0;
  const isLastLandingStep = landingStepIndex === LANDING_STEPS.length - 1;
  const isPermissionsStepBlocked = currentLandingStep === "permissions" && screenCaptureStatus !== "granted";
  const wizardCurrentStep = Math.max(landingStepIndex, 1);
  const wizardTotalSteps = LANDING_STEPS.length - 1;

  useEffect(() => {
    landingStepMemory = landingStepIndex;
  }, [landingStepIndex]);

  const handleNextLandingStep = () => {
    setLandingStepIndex((prev) => Math.min(prev + 1, LANDING_STEPS.length - 1));
  };

  const handlePreviousLandingStep = () => {
    setLandingStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const renderStepContent = (): ReactNode => {
    if (currentLandingStep === "welcome") {
      return null;
    }

    if (currentLandingStep === "language") {
      return (
        <section className="space-y-4 rounded-xl border border-white/15 bg-white/5 p-5">
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
        </section>
      );
    }

    if (currentLandingStep === "opacity") {
      return (
        <section className="space-y-4 rounded-xl border border-white/15 bg-white/5 p-5">
          <div className="grid grid-cols-3 gap-2">
            {OPACITY_PRESETS.map((preset) => {
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
        </section>
      );
    }

    if (currentLandingStep === "audioMode") {
      return (
        <section className="space-y-4 rounded-xl border border-white/15 bg-white/5 p-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={presetButtonClass(audioModeEnabled)}
              aria-pressed={audioModeEnabled}
              onClick={(e) => {
                blurOnClick(e);
                if (!audioModeEnabled) {
                  const unlock = new Audio(SILENT_WAV);
                  unlock.volume = 0.01;
                  void unlock.play().catch(() => {
                    /* ignore */
                  });
                }
                setAudioModeEnabled(true);
              }}
            >
              {t("home.onboarding.audioOn")}
            </button>
            <button
              type="button"
              className={presetButtonClass(!audioModeEnabled)}
              aria-pressed={!audioModeEnabled}
              onClick={(e) => {
                blurOnClick(e);
                setAudioModeEnabled(false);
              }}
            >
              {t("home.onboarding.audioOff")}
            </button>
          </div>
        </section>
      );
    }

    if (currentLandingStep === "textSize") {
      return (
        <section className="space-y-4 rounded-xl border border-white/15 bg-white/5 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        </section>
      );
    }

    if (currentLandingStep === "permissions") {
      return (
        <section className="space-y-4 rounded-xl border border-white/15 bg-white/5 p-5">
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
      );
    }

    return (
      <section className="space-y-4 rounded-xl border border-white/15 bg-white/5 p-5">
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
    );
  };

  const overlay = (
    <div
      className="interactable fixed inset-0 z-[2000000] flex flex-col overflow-y-auto bg-[hsl(var(--foreground)/var(--shell-bg-opacity))] text-white backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="landing-title"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-6 sm:px-10 sm:py-8">
        <header className="space-y-2 text-center">
          <TypographyH2 id="landing-title" className="!mt-0 !border-0 !pb-0 text-center text-white">
            {t("home.brandTitle")}
          </TypographyH2>
          <TypographyP className={`!mt-0 text-center ${TEXT_BASE} text-white/85`}>
            {t("home.tagline")}
          </TypographyP>
        </header>

        <div className="mt-6 mx-auto w-full max-w-4xl space-y-4">
          <div className="space-y-1 text-center">
            {!isFirstLandingStep ? (
              <p className={`${TEXT_XS} font-semibold uppercase tracking-wide text-white/65`}>
                {t("home.onboarding.progress", {
                  current: wizardCurrentStep,
                  total: wizardTotalSteps,
                })}
              </p>
            ) : null}
            <h3 className="text-[calc(1.125rem*var(--text-scale))] font-semibold text-white">
              {t(`home.onboarding.steps.${currentLandingStep}.title`)}
            </h3>
          </div>

          {renderStepContent()}
        </div>

        <div className="mx-auto mt-5 w-full max-w-4xl">
          {isFirstLandingStep ? (
            <Button
              type="button"
              className={`interactable w-full ${TEXT_BASE} bg-white text-black hover:bg-white/90`}
              onClick={handleNextLandingStep}
            >
              {t("home.onboarding.start")}
            </Button>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className={`interactable w-full ${TEXT_BASE} border-white/30 bg-transparent text-white hover:bg-white/10`}
                onClick={handlePreviousLandingStep}
              >
                {t("home.onboarding.back")}
              </Button>
              <Button
                type="button"
                disabled={!isLastLandingStep && isPermissionsStepBlocked}
                className={`interactable w-full ${TEXT_BASE} bg-white text-black hover:bg-white/90`}
                onClick={isLastLandingStep ? handleEnterApp : handleNextLandingStep}
              >
                {isLastLandingStep ? t("home.onboarding.getStarted") : t("home.onboarding.next")}
              </Button>
            </div>
          )}
        </div>
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
