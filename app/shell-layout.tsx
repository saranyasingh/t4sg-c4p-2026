"use client";

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useState } from "react";

export function ShellLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="fixed inset-0 flex items-center justify-end bg-transparent">
      <section
        className={`interactable relative mr-6 flex h-[90vh] max-h-[90vh] w-[420px] max-w-[92vw] transform-gpu flex-col rounded-2xl border border-white/30 bg-background/55 shadow-xl backdrop-blur-lg transition-transform duration-300 ease-out will-change-transform ${
          isCollapsed ? "translate-x-[calc(100%-4rem)]" : "translate-x-0"
        }`}
      >
        <button
          type="button"
          className="interactable absolute left-2 top-3 z-20 rounded-md border border-white/40 bg-background/85 p-1.5 text-foreground shadow"
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </button>
        <div className="flex-1 overflow-hidden">{children}</div>
      </section>
    </div>
  );
}
