"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TypographyH2, TypographyP, TypographySmall } from "@/components/ui/typography";
import { Message } from "@/app/chat/message";
import { ScrollContainer } from "@/app/chat/scroll-container";
import { useEffect, useRef } from "react";
import { useInteractiveTutorialAgent } from "./interactive-tutorial-workflow";

export function InteractiveTutorialPage() {
  const {
    goal,
    setGoal,
    prompt,
    setPrompt,
    log,
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

  return (
    <div className="interactable flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="space-y-1">
        <TypographyH2>Interactive tutorial</TypographyH2>
        <TypographyP className="text-sm text-white/80">
          Ask a question. The assistant will guide you step by step and highlight what to click.
        </TypographyP>
      </header>

      {!isActive ? (
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
      ) : (
        <div className="flex flex-1 min-h-0 flex-col gap-4">
          <section className="min-h-0 flex-1 overflow-hidden">
            <ScrollContainer>
              {log.length ? (
                log.map((m, idx) => <Message key={idx} text={m.text} variant={m.role} />)
              ) : (
                <Message
                  text={`Ask something like “Where is the Tutorials tab?” or “Help me open Gmail.”`}
                  variant="assistant"
                />
              )}
              {isLoading ? <Message text="Thinking..." variant="assistant" /> : null}
            </ScrollContainer>
          </section>

          <form
            ref={(el) => {
              promptFormRef.current = el;
            }}
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!prompt.trim() || isLoading) return;
              const p = prompt.trim();
              setPrompt("");
              void sendUserMessage(p);
            }}
          >
            <div className="relative flex-1">
              <Textarea
                ref={(el) => {
                  promptRef.current = el;
                }}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                rows={2}
                className="interactable resize-none text-white"
                placeholder="Ask a question…"
              />
            </div>
            <Button type="submit" disabled={isLoading || !prompt.trim()} className="interactable">
              Send
            </Button>
            <Button
              type="button"
              variant="outline"
              className="interactable border-white/30 bg-black/30 text-white"
              onClick={() => {
                exitInteractiveTutorial();
              }}
            >
              Exit tutorial
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
