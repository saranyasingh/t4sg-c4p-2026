"use client";

import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TypographyH2, TypographyP, TypographySmall } from "@/components/ui/typography";
import { useTutorial } from "@/app/tutorial/tutorial-provider";
import type { TutorialStep } from "@/lib/tutorials";
import { useEffect, useMemo, useRef, useState } from "react";

type BoundingBox = {
  selector: string;
  found: boolean;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
};

function boundingBoxes(selectors: string[]): { boxes: BoundingBox[] } {
  const boxes: BoundingBox[] = selectors.map((selector) => {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return { selector, found: false };
    const r = el.getBoundingClientRect();
    return {
      selector,
      found: true,
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    };
  });
  return { boxes };
}

function extractStepFromContent(content: unknown): TutorialStep | null {
  if (!Array.isArray(content)) return null;
  const textBlocks = content
    .filter((b) => b && typeof b === "object" && (b as any).type === "text" && typeof (b as any).text === "string")
    .map((b) => (b as any).text as string);
  const joined = textBlocks.join("\n").trim();
  if (!joined) return null;

  // Try to find the first JSON object in the text.
  const m = joined.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as Partial<TutorialStep> & { titleRaw?: string; textRaw?: string };
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.id !== "string") return null;
    const visual = parsed.visual;
    if (visual !== "text" && visual !== "screen" && visual !== "screen_text") return null;
    const textRaw = typeof parsed.textRaw === "string" ? parsed.textRaw : null;
    if (!textRaw) return null;
    return {
      id: parsed.id,
      titleRaw: typeof parsed.titleRaw === "string" ? parsed.titleRaw : undefined,
      text: "interactive.step", // unused when textRaw present
      textRaw,
      visual,
      highlightSelector: typeof parsed.highlightSelector === "string" ? parsed.highlightSelector : undefined,
      highlightDescription: typeof parsed.highlightDescription === "string" ? parsed.highlightDescription : undefined,
      highlightBright: Boolean((parsed as any).highlightBright),
    };
  } catch {
    return null;
  }
}

export default function InteractiveTutorialPage() {
  const {
    startInteractiveTutorial,
    addInteractiveStep,
    registerInteractiveNextStepGenerator,
    tutorialId,
    exitTutorial,
  } = useTutorial();

  const [goal, setGoal] = useState("");
  const [prompt, setPrompt] = useState("");
  const [log, setLog] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef<MessageParam[]>([]);
  const goalRef = useRef<HTMLTextAreaElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const promptFormRef = useRef<HTMLFormElement | null>(null);

  const isActive = tutorialId === "interactive";

  const initialMessages = useMemo<MessageParam[]>(
    () => [
      {
        role: "user",
        content:
          "We are starting an interactive tutorial. First, ask the user one short question about what they want to learn, then generate the first step.",
      },
    ],
    [],
  );

  useEffect(() => {
    messagesRef.current = initialMessages;
  }, [initialMessages]);

  const runAgentTurn = async (userText: string) => {
    const userMsg: MessageParam = { role: "user", content: userText };
    messagesRef.current = [...messagesRef.current, userMsg];

    let loops = 0;
    while (loops < 6) {
      loops += 1;
      const res = await fetch("/api/interactive-tutorial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesRef.current }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { content: unknown };
      const content = data.content;

      // Append assistant content to message history.
      messagesRef.current = [...messagesRef.current, { role: "assistant", content: content as any }];

      // If there is a tool_use, execute it and continue.
      const toolUse = Array.isArray(content)
        ? (content.find((b) => b && typeof b === "object" && (b as any).type === "tool_use") as any)
        : null;
      if (toolUse && toolUse.name === "bounding_boxes" && toolUse.id && toolUse.input?.selectors) {
        const selectors = Array.isArray(toolUse.input.selectors)
          ? toolUse.input.selectors.filter((s: unknown) => typeof s === "string")
          : [];
        const result = boundingBoxes(selectors);
        const toolResult: MessageParam = {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: String(toolUse.id),
              content: JSON.stringify(result),
            },
          ],
        };
        messagesRef.current = [...messagesRef.current, toolResult];
        continue;
      }

      // Otherwise we expect a step JSON in text.
      const step = extractStepFromContent(content);
      if (step) return step;

      // If no step and no tool_use, stop.
      return null;
    }
    return null;
  };

  const begin = async (firstPrompt: string) => {
    const first = firstPrompt.trim();
    if (!first) return;
    setIsLoading(true);
    setLog([{ role: "user", text: first }]);
    try {
      startInteractiveTutorial(goal || first);
      const step = await runAgentTurn(
        `User goal: ${goal || first}\nUser message: ${first}\nNow generate the next tutorial step JSON.`,
      );
      if (step) {
        addInteractiveStep(step);
      }
      setLog((prev) => [...prev, { role: "assistant", text: step?.textRaw ?? "Okay." }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    registerInteractiveNextStepGenerator(async () => {
      setIsLoading(true);
      try {
        const step = await runAgentTurn("No new user message. Generate the next tutorial step JSON.");
        if (step) addInteractiveStep(step);
      } finally {
        setIsLoading(false);
      }
    });
    return () => registerInteractiveNextStepGenerator(null);
  }, [addInteractiveStep, registerInteractiveNextStepGenerator]);

  // Clear chat input/log when tutorial exits.
  useEffect(() => {
    if (!isActive) {
      setGoal("");
      setPrompt("");
      setLog([]);
      messagesRef.current = initialMessages;
    }
  }, [initialMessages, isActive]);

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
        <div className="flex flex-1 flex-col gap-4">
          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-black/15 p-4">
            {log.length ? (
              <div className="space-y-3">
                {log.map((m, idx) => (
                  <div key={idx} className="text-sm">
                    <span className="font-semibold text-white/80">{m.role === "user" ? "You" : "Assistant"}:</span>{" "}
                    <span className="text-white/90">{m.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <TypographySmall className="text-white/70">
                Ask something like “Where is the Tutorials tab?” or “Help me open Gmail.”
              </TypographySmall>
            )}
          </div>

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
              setLog((prev) => [...prev, { role: "user", text: p }]);
              void (async () => {
                setIsLoading(true);
                try {
                  const step = await runAgentTurn(`User message: ${p}\nGenerate the next tutorial step JSON.`);
                  if (step) addInteractiveStep(step);
                  setLog((prev) => [...prev, { role: "assistant", text: step?.textRaw ?? "Okay." }]);
                } finally {
                  setIsLoading(false);
                }
              })();
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
                // Clear immediately (not just on effect) so UI resets even if something delays state propagation.
                setGoal("");
                setPrompt("");
                setLog([]);
                messagesRef.current = initialMessages;
                exitTutorial();
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

