"use client";

import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { useTutorial } from "@/app/tutorial/tutorial-provider";
import { INTERACTIVE_TUTORIAL_ID, type TutorialStep } from "@/lib/tutorials";
import { captureScreenToPngBase64 } from "@/lib/electron-screen-capture";
import { compressScreenshotForTutorialApi } from "@/lib/interactive-tutorial-screenshot";
import {
  isInteractiveTutorialToolPairingError,
  sanitizeInteractiveTutorialMessagesDeep,
} from "@/lib/interactive-tutorial-messages";
import { extractStepFromAnthropicContent } from "@/lib/interactive-tutorial-step-parse";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useInteractiveTutorialAgent() {
  const {
    startInteractiveTutorial,
    addInteractiveStep,
    replaceInteractiveStepAt,
    registerInteractiveNextStepGenerator,
    registerInteractivePromptHandler,
    tutorialId,
    exitTutorial,
    currentStep,
    currentStepIndex,
  } = useTutorial();

  const [goal, setGoal] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef<MessageParam[]>([]);
  const goalRef = useRef<string>("");
  const currentStepRef = useRef(currentStep);
  const currentStepIndexRef = useRef(currentStepIndex);

  useEffect(() => {
    currentStepRef.current = currentStep;
    currentStepIndexRef.current = currentStepIndex;
  }, [currentStep, currentStepIndex]);

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

  type TurnKind = "initial" | "user_prompt" | "next_click";

  const pushUserText = (text: string) => {
    const userMsg: MessageParam = { role: "user", content: text };
    messagesRef.current = [...messagesRef.current, userMsg];
  };

  const pushUserScreenshotContext = async (contextText: string) => {
    const cap = await captureScreenToPngBase64();
    if (!cap) {
      pushUserText(
        `${contextText}\n\n(Screenshot unavailable in this environment. Continue using best effort based on tutorial history.)`,
      );
      return;
    }

    const optimized = await compressScreenshotForTutorialApi(cap.base64);
    const userMsg: MessageParam = {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: optimized.mediaType,
            data: optimized.base64,
          },
        },
        { type: "text", text: contextText },
      ] as any,
    };
    messagesRef.current = [...messagesRef.current, userMsg];
  };

  const runAgentTurn = async (kind: TurnKind, userText: string): Promise<TutorialStep | null> => {
    if (kind === "next_click" || kind === "user_prompt") {
      await pushUserScreenshotContext(userText);
    } else {
      pushUserText(userText);
    }

    messagesRef.current = sanitizeInteractiveTutorialMessagesDeep(messagesRef.current);

    let loops = 0;
    while (loops < 6) {
      loops += 1;
      let res = await fetch("/api/interactive-tutorial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesRef.current }),
      });

      if (!res.ok) {
        let errBody = (await res.json().catch(() => null)) as {
          error?: string;
          hint?: string;
        } | null;
        let errMsg = errBody?.error ?? `HTTP ${res.status}`;

        const pairing = isInteractiveTutorialToolPairingError(errMsg);
        if (pairing || res.status === 400) {
          for (let attempt = 0; attempt < 4; attempt += 1) {
            messagesRef.current = sanitizeInteractiveTutorialMessagesDeep(messagesRef.current);
            res = await fetch("/api/interactive-tutorial", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messages: messagesRef.current }),
            });
            if (res.ok) break;
            errBody = (await res.json().catch(() => null)) as {
              error?: string;
              hint?: string;
            } | null;
            errMsg = errBody?.error ?? `HTTP ${res.status}`;
            if (!isInteractiveTutorialToolPairingError(errMsg)) {
              throw new Error(errBody?.hint ? `${errMsg} — ${errBody.hint}` : errMsg);
            }
          }
        }

        if (!res.ok) {
          throw new Error(errBody?.hint ? `${errMsg} — ${errBody.hint}` : errMsg);
        }
      }

      const data = (await res.json()) as { content: unknown };
      const content = data.content;

      // Append assistant content to message history.
      messagesRef.current = [...messagesRef.current, { role: "assistant", content: content as any }];

      // The model should never call any tools — it's instructed to emit step JSON only.
      // If it does call a tool (legacy behavior), respond with an error tool_result so
      // history stays valid, then continue the loop to give the model a chance to recover.
      const toolUses: any[] = Array.isArray(content)
        ? (content.filter((b) => b && typeof b === "object" && (b as any).type === "tool_use") as any[])
        : [];
      if (toolUses.length) {
        const results = toolUses
          .map((tu) => {
            const id = tu?.id ? String(tu.id) : null;
            if (!id) return null;
            return {
              type: "tool_result",
              tool_use_id: id,
              content: JSON.stringify({
                error:
                  "No tools are available. Emit step JSON only with highlightDescription for any on-screen target.",
              }),
            };
          })
          .filter(Boolean);

        const toolResult: MessageParam = {
          role: "user",
          content: results.length
            ? (results as any)
            : [
                {
                  type: "tool_result",
                  tool_use_id: "tool_use_missing_id",
                  content: JSON.stringify({ error: "tool_use missing id" }),
                },
              ],
        };

        messagesRef.current = [...messagesRef.current, toolResult];
        continue;
      }

      // Otherwise we expect a step JSON in text. The parser already accepts
      // only `highlightDescription` and silently drops any other targeting
      // field, so the step we hand back is guaranteed to use the Claude
      // Computer Use API pointer exclusively.
      const step = extractStepFromAnthropicContent(content);
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
    try {
      const resolvedGoal = (goal || first).trim();
      goalRef.current = resolvedGoal;
      startInteractiveTutorial(resolvedGoal);

      const step = await runAgentTurn(
        "initial",
        `Original goal: ${resolvedGoal}\n` +
          `User message: ${first}\n\n` +
          `Now generate exactly ONE next tutorial step JSON. Decide whether to include an on-screen pointer.`,
      );
      if (step) {
        addInteractiveStep(step);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sendUserMessage = useCallback(
    async (p: string) => {
      const trimmed = p.trim();
      if (!trimmed) return;
      setIsLoading(true);
      try {
        const resolvedGoal = goalRef.current || goal.trim();
        const cur = currentStepRef.current;
        const currentStepJson =
          cur != null
            ? JSON.stringify({
                id: cur.id,
                titleRaw: cur.titleRaw,
                textRaw: cur.textRaw,
                visual: cur.visual,
                highlightDescription: cur.highlightDescription,
              })
            : "(none)";
        const step = await runAgentTurn(
          "user_prompt",
          `Original goal: ${resolvedGoal}\n` +
            `User question: ${trimmed}\n\n` +
            `CURRENT OFFICIAL STEP (narrative context only — the screenshot shows where the user actually is):\n${currentStepJson}\n\n` +
            `You MUST follow the system rules for user chat mid-tutorial.\n` +
            `Use the screenshot as ground truth. Address the user's question first.\n` +
            `If their request needs a different screen than the screenshot shows, guide navigation (Back, links, etc.) before any steps about fields that are not visible.\n` +
            `Do not fill out or advance tasks on the visible page when the user asked to fix or revisit an earlier screen unless the screenshot already shows that earlier screen.\n` +
            `Generate exactly ONE tutorial step JSON. Decide whether to include an on-screen pointer.`,
        );
        if (step) addInteractiveStep(step);
      } finally {
        setIsLoading(false);
      }
    },
    [goal, addInteractiveStep],
  );

  const exitInteractiveTutorial = useCallback(() => {
    setGoal("");
    setPrompt("");
    messagesRef.current = initialMessages;
    goalRef.current = "";
    exitTutorial();
  }, [exitTutorial, initialMessages]);

  useEffect(() => {
    registerInteractiveNextStepGenerator(async () => {
      setIsLoading(true);
      try {
        const resolvedGoal = goalRef.current || goal.trim();
        const cur = currentStepRef.current;
        const currentStepJson =
          cur != null
            ? JSON.stringify({
                id: cur.id,
                titleRaw: cur.titleRaw,
                textRaw: cur.textRaw,
                visual: cur.visual,
                highlightDescription: cur.highlightDescription,
              })
            : "(none)";
        const step = await runAgentTurn(
          "next_click",
          `Original goal: ${resolvedGoal}\n` +
            `The user clicked NEXT.\n\n` +
            `CURRENT STEP (verify the screenshot matches this before advancing the lesson):\n${currentStepJson}\n\n` +
            `You MUST use the screenshot.\n` +
            `- If the screen does NOT match what CURRENT STEP expects, return ONE step JSON with the SAME "id" as CURRENT STEP and guide the user until they reach the right place for this step.\n` +
            `- If the screen DOES match CURRENT STEP, return ONE NEW step JSON with a NEW id continuing toward the goal.\n` +
            `Decide whether to include an on-screen pointer.`,
        );
        if (!step) return;
        const curId = currentStepRef.current?.id;
        const idx = currentStepIndexRef.current;
        if (curId && step.id === curId && typeof idx === "number") {
          replaceInteractiveStepAt(idx, step);
        } else {
          addInteractiveStep(step);
        }
      } finally {
        setIsLoading(false);
      }
    });
    return () => registerInteractiveNextStepGenerator(null);
  }, [addInteractiveStep, replaceInteractiveStepAt, registerInteractiveNextStepGenerator]);

  useEffect(() => {
    registerInteractivePromptHandler(async (text: string) => {
      const trimmed = String(text ?? "").trim();
      if (!trimmed) return;
      await sendUserMessage(trimmed);
    });
    return () => registerInteractivePromptHandler(null);
  }, [registerInteractivePromptHandler, sendUserMessage]);

  // Clear chat input/log when tutorial exits.
  useEffect(() => {
    if (!isActive) {
      setGoal("");
      setPrompt("");
      messagesRef.current = initialMessages;
      goalRef.current = "";
    }
  }, [initialMessages, isActive]);

  return {
    goal,
    setGoal,
    prompt,
    setPrompt,
    isLoading,
    isActive,
    begin,
    sendUserMessage,
    exitInteractiveTutorial,
  };
}
