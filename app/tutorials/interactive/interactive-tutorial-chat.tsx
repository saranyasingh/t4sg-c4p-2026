"use client";

import BoundingBoxOverlay from "@/app/bounding-box-overlay";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { Message, type MessageProps } from "@/app/chat/message";
import { ScrollContainer } from "@/app/chat/scroll-container";
import { captureScreenToPngBase64 } from "@/lib/electron-screen-capture";
import { findTargetViaChunkedVision } from "@/lib/screen-chunk-pipeline";
import type { AiTutorialStepPayload, HighlightToolResultPayload } from "@/lib/interactive-tutorial";
import { AI_GUIDED_TUTORIAL } from "@/lib/tutorials";
import type { StepVisual } from "@/lib/tutorials";
import { ChevronRight, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

type MessageWithId = MessageProps & { id: string; variant: "user" | "assistant" };

interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

type NdjsonDone =
  | { action: "capture_screen"; assistantContent: unknown }
  | { action: "show_screen_highlight"; assistantContent: unknown; targetDescription: string }
  | { action: "tutorial_step"; step: AiTutorialStepPayload; reply: string }
  | { action: null; reply: string };

const MAX_TOOL_CHAIN = 10;

function visualLabelKey(v: StepVisual): string {
  if (v === "text") return "tutorial.visualText";
  if (v === "screen") return "tutorial.visualScreen";
  return "tutorial.visualScreenText";
}

function formatAssistantStepForHistory(step: AiTutorialStepPayload): string {
  return `## ${step.title}\n\n${step.body}`;
}

function normalizeTutorialText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Same step card again on "Next step" — model failed to set done:true; treat as finished. */
function isDuplicateContinueStep(
  previous: AiTutorialStepPayload | null,
  next: AiTutorialStepPayload,
): boolean {
  if (!previous || next.done) return false;
  return (
    normalizeTutorialText(previous.title) === normalizeTutorialText(next.title) &&
    normalizeTutorialText(previous.body) === normalizeTutorialText(next.body)
  );
}

async function readNdjsonResponse(response: Response, onToken: (t: string) => void): Promise<NdjsonDone | { error: string }> {
  if (!response.body) return { error: "No response body" };
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let streamDone = false;
  let fullText = "";

  while (!streamDone) {
    const { done: isDone, value } = await reader.read();
    streamDone = isDone;
    if (value) buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let evt: unknown;
      try {
        evt = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (typeof evt !== "object" || evt === null || !("type" in evt)) continue;
      const row = evt as Record<string, unknown>;
      if (row.type === "token" && typeof row.text === "string") {
        fullText += row.text;
        onToken(fullText);
        continue;
      }
      if (row.type === "done") {
        const action = row.action;
        if (action === "capture_screen" && row.assistantContent != null) {
          return { action: "capture_screen", assistantContent: row.assistantContent };
        }
        if (action === "show_screen_highlight" && row.assistantContent != null) {
          const td = row.targetDescription;
          if (typeof td !== "string" || !td.trim()) {
            return { action: null, reply: fullText.trim() || "Invalid highlight request." };
          }
          return {
            action: "show_screen_highlight",
            assistantContent: row.assistantContent,
            targetDescription: td.trim(),
          };
        }
        if (action === "tutorial_step" && row.step && typeof row.step === "object") {
          const s = row.step as Record<string, unknown>;
          const title = typeof s.title === "string" ? s.title : "";
          const body = typeof s.body === "string" ? s.body : "";
          const visual = s.visual;
          const done = s.done === true;
          if (
            !title.trim() ||
            !body.trim() ||
            (visual !== "text" && visual !== "screen" && visual !== "screen_text")
          ) {
            return { action: null, reply: fullText.trim() || "Invalid tutorial step." };
          }
          const reply = typeof row.reply === "string" ? row.reply : fullText;
          return {
            action: "tutorial_step",
            step: {
              title: title.trim(),
              body: body.trim(),
              visual: visual as StepVisual,
              ...(done ? { done: true } : {}),
            },
            reply: reply.trim(),
          };
        }
        const reply = typeof row.reply === "string" ? row.reply : fullText;
        return { action: null, reply: reply.trim() || fullText.trim() };
      }
      if (row.type === "error") {
        const err = typeof row.error === "string" ? row.error : "Request failed";
        return { error: err };
      }
    }
  }

  const tail = buffer.trim();
  if (tail) {
    try {
      const row = JSON.parse(tail) as Record<string, unknown>;
      if (row.type === "done") {
        if (row.action === "capture_screen" && row.assistantContent != null) {
          return { action: "capture_screen", assistantContent: row.assistantContent };
        }
        if (row.action === "show_screen_highlight" && row.assistantContent != null) {
          const td = row.targetDescription;
          if (typeof td === "string" && td.trim()) {
            return {
              action: "show_screen_highlight",
              assistantContent: row.assistantContent,
              targetDescription: td.trim(),
            };
          }
        }
        if (row.action === "tutorial_step" && row.step && typeof row.step === "object") {
          const s = row.step as Record<string, unknown>;
          const title = typeof s.title === "string" ? s.title : "";
          const body = typeof s.body === "string" ? s.body : "";
          const visual = s.visual;
          const done = s.done === true;
          if (
            title.trim() &&
            body.trim() &&
            (visual === "text" || visual === "screen" || visual === "screen_text")
          ) {
            const reply = typeof row.reply === "string" ? row.reply : fullText;
            return {
              action: "tutorial_step",
              step: {
                title: title.trim(),
                body: body.trim(),
                visual: visual as StepVisual,
                ...(done ? { done: true } : {}),
              },
              reply: reply.trim(),
            };
          }
        }
        const reply = typeof row.reply === "string" ? row.reply : fullText;
        return { action: null, reply: reply.trim() || fullText.trim() };
      }
    } catch {
      /* ignore */
    }
  }

  return { action: null, reply: fullText.trim() || "Incomplete response." };
}

type TurnIntent = "user_message" | "continue_step";

export function InteractiveTutorialChat() {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<MessageWithId[]>([]);
  const [incomingMessage, setIncomingMessage] = useState("");
  const [sessionGoal, setSessionGoal] = useState("");
  const [currentStep, setCurrentStep] = useState<AiTutorialStepPayload | null>(null);
  const [tutorialStarted, setTutorialStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [highlight, setHighlight] = useState<{
    coords: { x: number; y: number; width: number; height: number; confidence: number };
    screenshotWidth: number;
    screenshotHeight: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stepAnnouncerRef = useRef<HTMLDivElement>(null);

  const TEXTAREA_MAX_PX = 200;

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const cap = Math.min(
      typeof window !== "undefined" ? Math.round(window.innerHeight * 0.22) : TEXTAREA_MAX_PX,
      TEXTAREA_MAX_PX,
    );
    const next = Math.min(el.scrollHeight, cap);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > cap ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [message, resizeTextarea]);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  const parseChatError = async (response: Response): Promise<string> => {
    const ct = response.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      try {
        const data = (await response.json()) as { error?: string };
        if (data.error) return `${data.error} (HTTP ${response.status})`;
      } catch {
        /* ignore */
      }
    }
    try {
      const text = (await response.text()).trim();
      if (text) return `${text} (HTTP ${response.status})`;
    } catch {
      /* ignore */
    }
    return `Request failed (HTTP ${response.status})`;
  };

  const buildRequestBody = useCallback(
    (opts: {
      sessionGoalForApi: string;
      phase?: string;
      prompt: string;
      history: ChatHistoryItem[];
      intent: TurnIntent;
      imageBase64?: string;
      assistantContent?: unknown;
      highlightResult?: HighlightToolResultPayload;
      lastStep?: { title?: string; body?: string };
    }) => {
      const base: Record<string, unknown> = {
        prompt: opts.prompt,
        history: opts.history,
        sessionGoal: opts.sessionGoalForApi || undefined,
        intent: opts.intent === "continue_step" ? "continue_step" : undefined,
      };
      if (opts.phase) base.phase = opts.phase;
      if (opts.imageBase64) base.imageBase64 = opts.imageBase64;
      if (opts.assistantContent !== undefined) base.assistantContent = opts.assistantContent;
      if (opts.highlightResult) base.highlightResult = opts.highlightResult;
      if (opts.lastStep) base.lastStep = opts.lastStep;
      return base;
    },
    [],
  );

  const runToolChain = useCallback(
    async (
      sessionGoalForApi: string,
      prompt: string,
      history: ChatHistoryItem[],
      initialResponse: Response,
      intent: TurnIntent,
      lastStepForContinue?: { title?: string; body?: string },
    ): Promise<
      | { ok: true; reply: string; step: AiTutorialStepPayload | null }
      | { ok: false; error: string }
    > => {
      let response = initialResponse;
      let guard = 0;
      const lastStepPayload =
        intent === "continue_step" && lastStepForContinue ? lastStepForContinue : undefined;

      while (guard < MAX_TOOL_CHAIN) {
        guard += 1;
        const ct = response.headers.get("content-type") ?? "";

        if (!response.ok) {
          return { ok: false, error: await parseChatError(response) };
        }

        if (!ct.includes("ndjson")) {
          return { ok: false, error: t("tutorials.interactiveAi.unexpectedContentType") };
        }

        setIncomingMessage("");
        const streamed = { text: "" };
        const result = await readNdjsonResponse(response, (full) => {
          streamed.text = full;
          setIncomingMessage(full);
        });

        if ("error" in result) {
          return { ok: false, error: result.error };
        }

        if (result.action === null) {
          return { ok: true, reply: result.reply || streamed.text, step: null };
        }

        if (result.action === "tutorial_step") {
          return { ok: true, reply: result.reply, step: result.step };
        }

        if (result.action === "capture_screen") {
          setIncomingMessage(t("chat.capturingScreen"));
          const cap = await captureScreenToPngBase64();
          if (!cap) {
            return { ok: false, error: t("chat.screenCaptureFailed") };
          }
          response = await fetch("/api/interactive-tutorial/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildRequestBody({
                sessionGoalForApi,
                phase: "complete_screenshot",
                prompt,
                history,
                intent,
                imageBase64: cap.base64,
                assistantContent: result.assistantContent,
                lastStep: lastStepPayload,
              }),
            ),
          });
          continue;
        }

        if (result.action === "show_screen_highlight") {
          setIncomingMessage(t("tutorials.interactiveAi.findingHighlight"));
          if (typeof window === "undefined" || !window.electronAPI) {
            const payload: HighlightToolResultPayload = {
              found: false,
              explanation: "Screen highlighting requires the desktop (Electron) app with screen capture permission.",
            };
            response = await fetch("/api/interactive-tutorial/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                buildRequestBody({
                  sessionGoalForApi,
                  phase: "complete_screen_highlight",
                  prompt,
                  history,
                  intent,
                  assistantContent: result.assistantContent,
                  highlightResult: payload,
                  lastStep: lastStepPayload,
                }),
              ),
            });
            setHighlight(null);
            continue;
          }

          try {
            const cap = await captureScreenToPngBase64();
            if (!cap) {
              const payload: HighlightToolResultPayload = {
                found: false,
                explanation: "Could not capture the screen.",
              };
              response = await fetch("/api/interactive-tutorial/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                  buildRequestBody({
                    sessionGoalForApi,
                    phase: "complete_screen_highlight",
                    prompt,
                    history,
                    intent,
                    assistantContent: result.assistantContent,
                    highlightResult: payload,
                    lastStep: lastStepPayload,
                  }),
                ),
              });
              setHighlight(null);
              continue;
            }

            const vision = await findTargetViaChunkedVision(cap, result.targetDescription);
            let payload: HighlightToolResultPayload;
            if (vision.found) {
              payload = {
                found: true,
                box: {
                  x: vision.box.x,
                  y: vision.box.y,
                  width: vision.box.width,
                  height: vision.box.height,
                  confidence: vision.box.confidence,
                },
                screenshotWidth: cap.width,
                screenshotHeight: cap.height,
              };
              setHighlight({
                coords: payload.box,
                screenshotWidth: cap.width,
                screenshotHeight: cap.height,
              });
            } else {
              payload = { found: false, explanation: vision.explanation };
              setHighlight(null);
            }

            response = await fetch("/api/interactive-tutorial/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                buildRequestBody({
                  sessionGoalForApi,
                  phase: "complete_screen_highlight",
                  prompt,
                  history,
                  intent,
                  assistantContent: result.assistantContent,
                  highlightResult: payload,
                  lastStep: lastStepPayload,
                }),
              ),
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Highlight failed";
            response = await fetch("/api/interactive-tutorial/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                buildRequestBody({
                  sessionGoalForApi,
                  phase: "complete_screen_highlight",
                  prompt,
                  history,
                  intent,
                  assistantContent: result.assistantContent,
                  highlightResult: { found: false, explanation: msg },
                  lastStep: lastStepPayload,
                }),
              ),
            });
            setHighlight(null);
          }
          continue;
        }
      }

      return { ok: false, error: t("tutorials.interactiveAi.toolLoopLimit") };
    },
    [buildRequestBody, t],
  );

  const runTurn = async (prompt: string, intent: TurnIntent) => {
    if (isLoading) return;
    if (intent === "user_message" && !prompt.trim()) return;
    if (intent === "continue_step" && !sessionGoal.trim()) return;
    if (intent === "continue_step" && isComplete) return;

    const history: ChatHistoryItem[] = messages
      .map((m) => ({
        role: m.variant,
        content: m.text,
      }))
      .slice(-30);

    const priorGoal = sessionGoal.trim();
    const nextAsk = prompt.trim();
    const goalForApi =
      intent === "user_message"
        ? priorGoal
          ? `${priorGoal}\n\nAlso help with: ${nextAsk}`
          : nextAsk
        : priorGoal;

    if (intent === "user_message") {
      const userMessage: MessageWithId = {
        id: Date.now().toString(),
        text: prompt.trim(),
        variant: "user",
      };
      setMessages((prev) => [...prev, userMessage]);
      // Keep the session goal aligned with the user's evolving requests so "Next step"
      // continues forward instead of snapping back to the first question.
      setSessionGoal(goalForApi);
      setIsComplete(false);
    }

    setMessage("");
    setHighlight(null);
    setIsLoading(true);
    setIncomingMessage("");

    const effectivePrompt = intent === "continue_step" ? "" : prompt.trim();

    try {
      const initial = await fetch("/api/interactive-tutorial/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildRequestBody({
            sessionGoalForApi: goalForApi,
            prompt: effectivePrompt,
            history,
            intent,
            lastStep: intent === "continue_step" ? { title: currentStep?.title, body: currentStep?.body } : undefined,
          }),
        ),
      });

      const final = await runToolChain(
        goalForApi,
        effectivePrompt,
        history,
        initial,
        intent,
        intent === "continue_step" ? { title: currentStep?.title, body: currentStep?.body } : undefined,
      );
      setIncomingMessage("");

      if (!final.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            text: t("chat.errorWithDetail", { detail: final.error }),
            variant: "assistant",
            isError: true,
          },
        ]);
        return;
      }

      setTutorialStarted(true);

      if (final.step) {
        let stepForUi = final.step;
        if (
          intent === "continue_step" &&
          !final.step.done &&
          isDuplicateContinueStep(currentStep, final.step)
        ) {
          stepForUi = {
            title: t("tutorials.interactiveAi.tutorialCompleteTitle"),
            body: t("tutorials.interactiveAi.tutorialCompleteBody"),
            visual: "text",
            done: true,
          };
        }
        setCurrentStep(stepForUi);
        setIsComplete(Boolean(stepForUi.done));
        const assistantText = formatAssistantStepForHistory(stepForUi);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            text: assistantText,
            variant: "assistant",
          },
        ]);
      } else {
        const text = final.reply || t("chat.emptyResponse");
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            text,
            variant: "assistant",
          },
        ]);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : t("chat.unknownError");
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: t("chat.errorWithDetail", { detail: reason }),
          variant: "assistant",
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runTurn(message, "user_message");
  };

  const handleNextStep = () => {
    void runTurn("", "continue_step");
  };

  const hasSpotlight = Boolean(highlight?.coords);
  const showLanding = !tutorialStarted && messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={stepAnnouncerRef} className="sr-only" aria-live="polite" aria-atomic>
        {currentStep ? `${currentStep.title}. ${currentStep.body}` : ""}
      </div>

      {mounted && hasSpotlight
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-0 z-[999990]"
              style={{ background: "rgba(8, 10, 16, 0.5)" }}
              aria-hidden
            />,
            document.body,
          )
        : null}
      {mounted && highlight ? (
        <BoundingBoxOverlay
          coords={highlight.coords}
          screenshotWidth={highlight.screenshotWidth}
          screenshotHeight={highlight.screenshotHeight}
          expandFactor={2.5}
        />
      ) : null}

      {showLanding ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-4 py-8">
          <div className="w-full max-w-2xl space-y-3 text-center">
            <TypographyH2 className="text-2xl sm:text-3xl">{t("tutorials.interactiveAi.landingTitle")}</TypographyH2>
            <TypographyP className="text-sm text-white/80">{t("tutorials.interactiveAi.landingSubtitle")}</TypographyP>
          </div>
          <form onSubmit={handleSubmit} className="flex w-full max-w-2xl flex-col gap-3">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("tutorials.interactiveAi.landingPlaceholder")}
              className="interactable min-h-[180px] resize-none border-white/20 bg-black/50 text-base text-white placeholder:text-white/40"
              rows={6}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button
              type="submit"
              className="interactable h-12 w-full bg-white text-black hover:bg-white/90 sm:mx-auto sm:w-auto sm:min-w-[200px]"
              disabled={isLoading || !message.trim()}
            >
              {t("tutorials.interactiveAi.startLearning")}
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
          <section
            className="flex min-h-[200px] min-w-0 flex-1 flex-col gap-3 lg:max-w-[min(100%,480px)]"
            aria-labelledby="ai-tutorial-step-title"
          >
            <div className="rounded-2xl border border-white/20 bg-black/40 p-4 shadow-xl backdrop-blur-md">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                    {t(AI_GUIDED_TUTORIAL.title)}
                  </p>
                  {currentStep ? (
                    <h2 id="ai-tutorial-step-title" className="text-lg font-semibold leading-snug text-white">
                      {currentStep.title}
                    </h2>
                  ) : (
                    <h2 id="ai-tutorial-step-title" className="text-lg font-semibold text-white/80">
                      {t("tutorials.interactiveAi.stepPlaceholderTitle")}
                    </h2>
                  )}
                </div>
                {currentStep ? (
                  <span
                    className="shrink-0 rounded-md border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/85"
                    title={t("tutorial.visualBadgeHint")}
                  >
                    {t(visualLabelKey(currentStep.visual))}
                  </span>
                ) : null}
              </div>
              <TypographyP className="whitespace-pre-wrap text-sm leading-relaxed text-white/95">
                {currentStep?.body ?? t("tutorials.interactiveAi.stepPlaceholderBody")}
              </TypographyP>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="interactable gap-1 bg-white/15 text-white hover:bg-white/25"
                disabled={isLoading || !sessionGoal.trim() || isComplete}
                onClick={handleNextStep}
              >
                <ChevronRight className="h-4 w-4" />
                {t("tutorials.interactiveAi.nextStep")}
              </Button>
              {isComplete ? (
                <Button asChild className="interactable bg-white text-black hover:bg-white/90">
                  <Link href="/tutorials">{t("tutorials.interactiveAi.finishTutorial")}</Link>
                </Button>
              ) : null}
            </div>
          </section>

          <div className="flex min-h-0 min-w-0 flex-[1.2] flex-col rounded-2xl border border-white/20 bg-black/35 shadow-xl backdrop-blur-md">
            <div className="min-h-[200px] flex-1">
              <ScrollContainer>
                {messages.map((m) => (
                  <Message key={m.id} text={m.text} variant={m.variant} isError={m.isError} />
                ))}
                {isLoading ? (
                  <Message text={incomingMessage || t("chat.thinking")} variant="assistant" />
                ) : null}
              </ScrollContainer>
            </div>

            <form onSubmit={handleSubmit} className="shrink-0 border-t border-white/10 p-3">
              <TypographyP className="mb-2 text-[11px] text-white/50">{t("tutorials.interactiveAi.chatHint")}</TypographyP>
              <div className="flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("tutorials.interactiveAi.inputPlaceholder")}
                  className="interactable min-h-[52px] flex-1 resize-none border-white/20 bg-black/40 text-white placeholder:text-white/40"
                  rows={2}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <Button
                  type="submit"
                  className="interactable h-11 w-11 shrink-0 p-0"
                  disabled={isLoading || !message.trim()}
                  aria-label={t("chat.senderUser")}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
