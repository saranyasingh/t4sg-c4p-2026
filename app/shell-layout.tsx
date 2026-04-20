"use client";

import { Button } from "@/components/ui/button";
import { TypographySmall } from "@/components/ui/typography";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import c4pLogo from "../public/images/c4p.png";
import { TutorialController } from "./tutorial/tutorial-controller";

export function ShellLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();
  const pathname = usePathname();

  const tabs = [
    { href: "/", label: t("shell.tabs.home") },
    { href: "/tutorials", label: t("shell.tabs.tutorials") },
    { href: "/options", label: t("shell.tabs.options") },
  ];

  useEffect(() => {
    setMounted(true);
  }, []);

  const panel = (
    <section
      className={`interactable fixed right-6 top-0 z-[999999] flex h-full min-h-0 w-[420px] max-w-[92vw] transform-gpu flex-col rounded-2xl border border-white/45 bg-[hsl(var(--foreground)/var(--shell-bg-opacity))] text-white shadow-xl backdrop-blur-lg transition-transform duration-300 ease-out will-change-transform ${
        isCollapsed ? "translate-x-[calc(100%-3rem)]" : "translate-x-0"
      }`}
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
      <div className="shrink-0 px-4 pb-2 pt-14">
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/30 bg-black/20 p-1">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

            return (
              <Link
                key={tab.href}
                href={tab.href}
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

  if (!mounted) return null;
  return createPortal(panel, document.body);
}
