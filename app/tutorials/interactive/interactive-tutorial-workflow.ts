"use client";

import { useTutorial } from "@/app/tutorial/tutorial-provider";
import { INTERACTIVE_TUTORIAL_ID, type TutorialStep } from "@/lib/tutorials";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface BoundingBox {
  selector: string;
  found: boolean;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

function promptLikelyNeedsScreenPointer(userText: string): boolean {
  const t = userText.toLowerCase();
  const keywords = [
    "chrome",
    "browser",
    "address bar",
    "url",
    "gmail",
    "inbox",
    "tab",
    "desktop",
    "dock",
    "taskbar",
    "start menu",
    "google",
    "icon",
    "open",
    "click",
    "word",
    "microsoft word",
    "excel",
    "powerpoint",
    "outlook",
    "application",
    "app",
    "program",
    "windows",
    "spotlight",
    "launchpad",
  ];
  return keywords.some((k) => t.includes(k));
}

function boundingBoxes(selectors: string[]): { boxes: BoundingBox[] } {
  const boxes: BoundingBox[] = selectors.map((selector) => {
    const el = document.querySelector(selector);
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
    const highlightSelector = typeof parsed.highlightSelector === "string" ? parsed.highlightSelector : undefined;
    const highlightDescription =
      typeof parsed.highlightDescription === "string" ? parsed.highlightDescription : undefined;

    // Guardrails: don't allow "random" highlights for pure text steps.
    const allowHighlight = visual !== "text";

    return {
      id: parsed.id,
      titleRaw: typeof parsed.titleRaw === "string" ? parsed.titleRaw : undefined,
      text: "interactive.step", // unused when textRaw present
      textRaw,
      visual,
      highlightSelector: allowHighlight ? highlightSelector : undefined,
      highlightDescription: allowHighlight ? highlightDescription : undefined,
      highlightBright: Boolean((parsed as any).highlightBright),
    };
  } catch {
    return null;
  }
}

export function useInteractiveTutorialAgent() {
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

  const isActive = tutorialId === INTERACTIVE_TUTORIAL_ID;

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

  const runAgentTurn = async (
    userText: string,
    opts?: { forceScreenPointer?: boolean; attempt?: number },
  ): Promise<TutorialStep | null> => {
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
      if (step) {
        // Validate in-app selector highlights before accepting them.
        if (step.highlightSelector) {
          const check = boundingBoxes([step.highlightSelector]);
          const found = check.boxes[0]?.found === true;
          if (!found) {
            return { ...step, highlightSelector: undefined };
          }
        }

        if (opts?.forceScreenPointer) {
          const hasPointer = Boolean(step.highlightDescription);
          const isScreenStep = step.visual === "screen" || step.visual === "screen_text";
          if (!hasPointer || !isScreenStep) {
            const attempt = opts.attempt ?? 0;
            if (attempt < 1) {
              return runAgentTurn(
                `Regenerate the step with an on-screen pointer.\n` +
                  `Requirements:\n` +
                  `- visual MUST be "screen" or "screen_text"\n` +
                  `- include highlightDescription (clear English description)\n` +
                  `- do NOT include highlightSelector\n\n` +
                  `Original user message: ${userText}`,
                { forceScreenPointer: true, attempt: attempt + 1 },
              );
            }
          }
        }
        return step;
      }

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
      const forcePointer = promptLikelyNeedsScreenPointer(first);
      const step = await runAgentTurn(
        `User goal: ${goal || first}\nUser message: ${first}\nNow generate the next tutorial step JSON.`,
        { forceScreenPointer: forcePointer },
      );
      if (step) {
        addInteractiveStep(step);
      }
      setLog((prev) => [...prev, { role: "assistant", text: step?.textRaw ?? "Okay." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendUserMessage = async (p: string) => {
    const trimmed = p.trim();
    if (!trimmed) return;
    setLog((prev) => [...prev, { role: "user", text: trimmed }]);
    setIsLoading(true);
    try {
      const forcePointer = promptLikelyNeedsScreenPointer(trimmed);
      const step = await runAgentTurn(`User message: ${trimmed}\nGenerate the next tutorial step JSON.`, {
        forceScreenPointer: forcePointer,
      });
      if (step) addInteractiveStep(step);
      setLog((prev) => [...prev, { role: "assistant", text: step?.textRaw ?? "Okay." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const exitInteractiveTutorial = useCallback(() => {
    setGoal("");
    setPrompt("");
    setLog([]);
    messagesRef.current = initialMessages;
    exitTutorial();
  }, [exitTutorial, initialMessages]);

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

  return {
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
  };
}
