"use client";

import { Button } from "@/components/ui/button";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import c4pLogo from "../public/images/c4p.png";
import NavLinks from "./(components-navbar)/nav-links";
import { TutorialController } from "./tutorial/tutorial-controller";

export function ShellLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    setMounted(true);
  }, []);

  const panel = (
    <section
      className={`interactable fixed right-6 top-0 z-[999999] flex h-full min-h-0 w-[420px] max-w-[92vw] transform-gpu flex-col rounded-2xl border border-white/30 bg-[hsl(var(--foreground)/0.7)] text-white shadow-xl backdrop-blur-lg transition-transform duration-300 ease-out will-change-transform ${
        isCollapsed ? "translate-x-[calc(100%-3rem)]" : "translate-x-0"
      }`}
    >
      <Button
        type="button"
        variant="outline"
        className="interactable absolute left-1 top-1 z-20 h-8 w-8 min-w-0 rounded-full border-white/30 bg-[hsl(var(--foreground)/0.8)] p-0 text-white"
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
        title={isCollapsed ? "Expand" : "Collapse"}
      >
        {isCollapsed ? (
          <PanelRightOpen className="h-4 w-4 text-white" />
        ) : (
          <PanelRightClose className="h-4 w-4 text-white" />
        )}
      </Button>
      <Image
        src={c4pLogo}
        alt="Computers 4 People logo"
        width={44}
        height={44}
        className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2"
        priority
      />
      <div className="shrink-0 border-b border-white/10 px-3 pb-2 pt-12">
        <NavLinks className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs" />
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
