"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TypographyH2, TypographySmall } from "@/components/ui/typography";
import { useEffect, useRef } from "react";
import { useInteractiveTutorialAgent } from "./interactive-tutorial-workflow";

export function InteractiveTutorialPage() {
  const {
    goal,
    setGoal,
    prompt,
    setPrompt,
    isLoading,
    isActive,
    begin,
    sendUserMessage,
    exitInteractiveTutorial,
  } = useInteractiveTutorialAgent();

  const goalRef = useRef<HTMLTextAreaElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const promptFormRef = useRef<HTMLFormElement | null>(null);

  // Native keydown handler so Enter-to-send works reliably in Electron.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      if ("isComposing" in e && Boolean((e as unknown as { isComposing?: boolean }).isComposing)) return;

      const active = document.activeElement;

      // On the goal screen, Enter starts.
      if (!isActive && goalRef.current && active === goalRef.current) {
        if (isLoading) return;
        e.preventDefault();
        if (goal.trim()) void begin(goal);
        return;
      }

      // In active tutorial chat, Enter sends.
      if (isActive && promptRef.current && active === promptRef.current) {
        if (isLoading) return;
        if (!prompt.trim()) return;
        e.preventDefault();
        const form = promptFormRef.current;
        if (form?.requestSubmit) form.requestSubmit();
        else form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
  }, [begin, goal, isActive, isLoading, prompt]);

  // Once an interactive tutorial is active, the GransonAI side panel is
  // collapsed off-screen and all user interaction happens through the
  // floating lesson card + the slim chat box that sits under it. We render
  // an empty container here so the workflow hook (which owns the message
  // history and registers the prompt/next-step handlers with the provider)
  // stays mounted, but no visual UI leaks behind the hidden panel.
  if (isActive) {
    // Suppress unused-variable warnings for fields the active branch no
    // longer consumes — they're owned by the floating chat box now.
    void prompt;
    void promptRef;
    void promptFormRef;
    void setPrompt;
    void sendUserMessage;
    void exitInteractiveTutorial;
    return <div aria-hidden="true" className="hidden" />;
  }

  return (
    <div className="interactable flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="space-y-1">
        <TypographyH2>Interactive tutorial</TypographyH2>
      </header>

      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-white/5 p-6">
          <TypographySmall className="mb-2 text-white/80">What do you want to learn?</TypographySmall>
          <Textarea
            ref={(el) => {
              goalRef.current = el;
            }}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            className="interactable resize-none text-white"
            placeholder="Example: how to send an email in Gmail"
          />
          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              className="interactable bg-white text-black hover:bg-white/90"
              disabled={!goal.trim() || isLoading}
              onClick={() => {
                void begin(goal.trim());
              }}
            >
              {isLoading ? "Starting..." : "Start"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
