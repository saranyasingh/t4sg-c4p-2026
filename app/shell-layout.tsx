"use client";

import { Button } from "@/components/ui/button";
import { TypographySmall } from "@/components/ui/typography";
import { INTRO_TUTORIAL_ID } from "@/lib/tutorials";
import { HelpCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import c4pLogo from "../public/images/c4p.png";
import { useLanding } from "./landing-context";
import { InteractiveChatBar } from "./tutorial/interactive-chat-bar";
import { TutorialController } from "./tutorial/tutorial-controller";
import { useTutorial } from "./tutorial/tutorial-provider";

export function ShellLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();
  const { startTutorial, tutorialId } = useTutorial();
  const { hasEnteredApp } = useLanding();
  const pathname = usePathname();
  const router = useRouter();

  // CONTENT tutorials (Gmail, Google Search, interactive AI): collapse the
  // GransonAI panel off-screen so the lesson step card + the slim chat box
  // beneath it are the only on-screen UI.
  //
  // The APP TOUR (intro) is the exception — it teaches the GransonAI panel
  // itself, so the chatbot stays "on the side" (in the panel) and there is
  // no floating chat box. The lesson step card sits at its standard bottom
  // anchor and points at panel features by name in plain text.
  //
  // We KEEP the panel mounted (translated off-screen + opacity-0 +
  // pointer-events-none) so the InteractiveTutorialPage's workflow hook —
  // which owns the interactive AI tutorial's message history — stays alive
  // across the tutorial.
  const isContentTutorialRunning = tutorialId != null && tutorialId !== INTRO_TUTORIAL_ID;

  // The intro tour highlights elements that only exist on the home page (chat,
  // voice, audio-mode, language). Make sure we route there before kicking off
  // the tour so every step has a target to highlight.
  const handleStartIntro = () => {
    if (tutorialId === INTRO_TUTORIAL_ID) {
      return;
    }

    const delayMs = pathname !== "/" ? 300 : 80;
    if (pathname !== "/") {
      router.push("/");
    }
    window.setTimeout(() => {
      startTutorial(INTRO_TUTORIAL_ID);
    }, delayMs);
  };

  const tabs = [
    { href: "/", label: t("shell.tabs.home") },
    { href: "/tutorials", label: t("shell.tabs.tutorials") },
    { href: "/options", label: t("shell.tabs.options") },
  ];

  useEffect(() => {
    setMounted(true);
  }, []);

  // If the user reloads on a non-home route before dismissing the landing
  // screen, send them back to "/" so the landing overlay shows. Without this,
  // pages like /tutorials would render with no panel and no landing — just
  // black default text on the transparent body, "hidden in the dark."
  useEffect(() => {
    if (!hasEnteredApp && pathname !== "/") {
      router.replace("/");
    }
  }, [hasEnteredApp, pathname, router]);

  const isIntroActive = tutorialId === INTRO_TUTORIAL_ID;

  // Translate fully off-screen during any content tutorial. The panel stays
  // visible during the App Tour (and when no tutorial is active).
  const panelHidden = isContentTutorialRunning;
  const panelTranslateClass = panelHidden
    ? "translate-x-[calc(100%+2rem)] pointer-events-none opacity-0"
    : isCollapsed
      ? "translate-x-[calc(100%-3rem)]"
      : "translate-x-0";

  const panel = (
    <section
      aria-hidden={panelHidden ? true : undefined}
      className={`interactable fixed right-6 top-0 z-[999999] flex h-full min-h-0 w-[420px] max-w-[92vw] transform-gpu flex-col rounded-2xl border border-white/45 bg-[hsl(var(--foreground)/var(--shell-bg-opacity))] text-white shadow-xl backdrop-blur-lg transition-[transform,opacity] duration-300 ease-out will-change-transform ${panelTranslateClass}`}
    >
      <Button
        type="button"
        variant="outline"
        className="interactable absolute left-1 top-1 z-20 h-8 w-auto min-w-0 rounded-full border-white/30 bg-[hsl(var(--foreground)/0.8)] px-2 py-0 text-xs font-semibold text-white"
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
        title={isCollapsed ? "Expand" : "Collapse"}
      >
        <TypographySmall className="m-0 font-semibold leading-none text-inherit">
          {isCollapsed ? t("shell.open") : t("shell.close")}
        </TypographySmall>
      </Button>
      <Image
        src={c4pLogo}
        alt="Computers 4 People logo"
        width={44}
        height={44}
        className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2"
        priority
      />
      <Button
        type="button"
        variant={isIntroActive ? "default" : "outline"}
        data-intro="help"
        className={`interactable absolute right-1 top-1 z-20 h-8 min-w-0 gap-1 rounded-full px-3 text-xs font-semibold ${
          isIntroActive
            ? "bg-white text-black hover:bg-white/90"
            : "!hover:text-white border-white/30 bg-[hsl(var(--foreground)/0.8)] text-white hover:bg-accent"
        }`}
        onClick={handleStartIntro}
        aria-label={t("help.buttonAriaLabel")}
        title={t("help.buttonTitle")}
      >
        <HelpCircle className="h-4 w-4" />
        <TypographySmall className="m-0 font-semibold leading-none text-inherit">
          {t("help.buttonLabel")}
        </TypographySmall>
      </Button>

      <div className="shrink-0 px-4 pb-2 pt-14">
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/30 bg-black/20 p-1">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                data-intro={tab.href === "/tutorials" ? "tutorials" : undefined}
                className={`interactable rounded-lg px-2 py-1.5 text-center text-xs font-semibold transition-colors ${
                  isActive ? "bg-white/25 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                <TypographySmall className="font-semibold leading-none text-inherit">{tab.label}</TypographySmall>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        <TutorialController />
      </div>
      <p className="shrink-0 px-4 pb-2 text-center text-[10px] text-white/70">{t("shell.rights")}</p>
    </section>
  );

  // Before the user dismisses the landing screen, render children directly so
  // the page (and its full-screen landing overlay) can mount with no shell
  // panel competing for the viewport. Once they click "Let's get started",
  // swap to the shell panel — which contains children — so the app lives in
  // the side panel only.
  if (!mounted || !hasEnteredApp) {
    return <>{children}</>;
  }
  return (
    <>
      {createPortal(panel, document.body)}
      <InteractiveChatBar />
    </>
  );
}
