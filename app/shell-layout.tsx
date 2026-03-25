"use client";

import { Button } from "@/components/ui/button";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import c4pLogo from "./c4p.png";

export function ShellLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 flex items-center justify-end bg-transparent">
      <section
        className={`interactable relative mr-6 flex h-[90vh] max-h-[90vh] w-[420px] max-w-[92vw] transform-gpu flex-col rounded-2xl border border-white/30 bg-[hsl(var(--foreground)/0.7)] text-white shadow-xl backdrop-blur-lg transition-transform duration-300 ease-out will-change-transform ${
          isCollapsed ? "translate-x-[calc(100%-4rem)]" : "translate-x-0"
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
        <div className="flex-1 overflow-hidden">{children}</div>
        <p className="shrink-0 px-4 pb-2 text-center text-[10px] text-white/70">{t("shell.rights")}</p>
      </section>
    </div>
  );
}
