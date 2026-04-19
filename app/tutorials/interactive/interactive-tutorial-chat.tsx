"use client";

import BoundingBoxOverlay from "@/app/bounding-box-overlay";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { Message, type MessageProps } from "@/app/chat/message";
import { ScrollContainer } from "@/app/chat/scroll-container";
import { captureScreenToPngBase64 } from "@/lib/electron-screen-capture";
import { findTargetViaChunkedVision } from "@/lib/screen-chunk-pipeline";
import type { HighlightToolResultPayload } from "@/lib/interactive-tutorial";
import { Send } from "lucide-react";
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
  | { action: null; reply: string };

const MAX_TOOL_CHAIN = 10;

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
        const reply = typeof row.reply === "string" ? row.reply : fullText;
        return { action: null, reply: reply.trim() || fullText.trim() };
      }
    } catch {
      /* ignore */
    }
  }

  return { action: null, reply: fullText.trim() || "Incomplete response." };
}

export function InteractiveTutorialChat() {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<MessageWithId[]>([]);
  const [incomingMessage, setIncomingMessage] = useState("");
  const [highlight, setHighlight] = useState<{
    coords: { x: number; y: number; width: number; height: number; confidence: number };
    screenshotWidth: number;
    screenshotHeight: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        if (data.error) return data.error;
      } catch {
        /* ignore */
      }
    }
    return `HTTP ${response.status}`;
  };

  const runToolChain = useCallback(
    async (
      prompt: string,
      history: ChatHistoryItem[],
      initialResponse: Response,
    ): Promise<{ ok: true; reply: string } | { ok: false; error: string }> => {
      let response = initialResponse;
      let guard = 0;

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
          return { ok: true, reply: result.reply || streamed.text };
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
            body: JSON.stringify({
              phase: "complete_screenshot",
              prompt,
              history,
              imageBase64: cap.base64,
              assistantContent: result.assistantContent,
            }),
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
              body: JSON.stringify({
                phase: "complete_screen_highlight",
                prompt,
                history,
                assistantContent: result.assistantContent,
                highlightResult: payload,
              }),
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
                body: JSON.stringify({
                  phase: "complete_screen_highlight",
                  prompt,
                  history,
                  assistantContent: result.assistantContent,
                  highlightResult: payload,
                }),
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
              body: JSON.stringify({
                phase: "complete_screen_highlight",
                prompt,
                history,
                assistantContent: result.assistantContent,
                highlightResult: payload,
              }),
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Highlight failed";
            response = await fetch("/api/interactive-tutorial/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phase: "complete_screen_highlight",
                prompt,
                history,
                assistantContent: result.assistantContent,
                highlightResult: { found: false, explanation: msg },
              }),
            });
            setHighlight(null);
          }
          continue;
        }
      }

      return { ok: false, error: t("tutorials.interactiveAi.toolLoopLimit") };
    },
    [t],
  );

  const runSubmit = async () => {
    if (!message.trim() || isLoading) return;

    const prompt = message.trim();
    const history: ChatHistoryItem[] = messages
      .map((m) => ({
        role: m.variant,
        content: m.text,
      }))
      .slice(-30);

    const userMessage: MessageWithId = {
      id: Date.now().toString(),
      text: prompt,
      variant: "user",
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setHighlight(null);
    setIsLoading(true);
    setIncomingMessage("");

    try {
      const initial = await fetch("/api/interactive-tutorial/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, history }),
      });

      const final = await runToolChain(prompt, history, initial);
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

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: final.reply || t("chat.emptyResponse"),
          variant: "assistant",
        },
      ]);
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
    void runSubmit();
  };

  const hasSpotlight = Boolean(highlight?.coords);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-6">
        <div className="w-full max-w-xl space-y-2 text-center">
          <TypographyH2 className="text-xl sm:text-2xl">{t("tutorials.interactiveAi.heading")}</TypographyH2>
          <TypographyP className="text-sm text-white/80">{t("tutorials.interactiveAi.subheading")}</TypographyP>
        </div>

        <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col rounded-2xl border border-white/20 bg-black/35 shadow-xl backdrop-blur-md">
          <div className="min-h-[200px] flex-1">
            <ScrollContainer>
              {messages.length === 0 && !isLoading ? (
                <TypographyP className="py-8 text-center text-sm text-white/60">
                  {t("tutorials.interactiveAi.emptyHint")}
                </TypographyP>
              ) : null}
              {messages.map((m) => (
                <Message key={m.id} text={m.text} variant={m.variant} isError={m.isError} />
              ))}
              {isLoading ? (
                <Message text={incomingMessage || t("chat.thinking")} variant="assistant" />
              ) : null}
            </ScrollContainer>
          </div>

          <form onSubmit={handleSubmit} className="shrink-0 border-t border-white/10 p-3">
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
    </div>
  );
}
