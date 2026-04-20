"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TypographyH2, TypographyP, TypographySmall } from "@/components/ui/typography";
import { toast } from "@/components/ui/use-toast";
import { captureScreenToPngBase64 } from "@/lib/electron-screen-capture";
import { Send } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAudioMode } from "../audio-mode-context";
import { Message, type MessageProps } from "./message";
import { ScrollContainer } from "./scroll-container";
import { VoiceInput } from "./voice-input"; // ← NEW

type MessageWithId = MessageProps & { id: string; variant: "user" | "assistant" };
interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

const CHAT_STORAGE_KEY = "t4sg-c4p-chat-messages-v1";

function parseStoredMessages(raw: unknown): MessageWithId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is MessageWithId =>
      Boolean(m) &&
      typeof m === "object" &&
      typeof (m as MessageWithId).id === "string" &&
      typeof (m as MessageWithId).text === "string" &&
      ((m as MessageWithId).variant === "user" || (m as MessageWithId).variant === "assistant"),
  );
}

interface ChatProps {
  showHeader?: boolean;
}

export function Chat({ showHeader = true }: ChatProps) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<MessageWithId[]>([]);
  const [messagesHydrated, setMessagesHydrated] = useState(false);
  const [incomingMessage, setIncomingMessage] = useState("");
  const [, setIsSpeechPlaying] = useState(false);
  const { audioModeEnabled } = useAudioMode();
  const audioModeEnabledRef = useRef(audioModeEnabled);
  const speechObjectUrlRef = useRef<string | null>(null);
  const speechAudioRef = useRef<HTMLAudioElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  audioModeEnabledRef.current = audioModeEnabled;

  const TEXTAREA_MAX_PX = 168;

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const cap = Math.min(
      typeof window !== "undefined" ? Math.round(window.innerHeight * 0.24) : TEXTAREA_MAX_PX,
      TEXTAREA_MAX_PX,
    );
    const next = Math.min(el.scrollHeight, cap);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > cap ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [message, resizeTextarea]);

  const { t } = useTranslation();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = parseStoredMessages(JSON.parse(raw));
        if (parsed.length) setMessages(parsed);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setMessagesHydrated(true);
  }, []);

  useEffect(() => {
    if (!messagesHydrated) return;
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* quota / private mode */
    }
  }, [messages, messagesHydrated]);

  useEffect(() => {
    return () => {
      if (speechAudioRef.current) {
        speechAudioRef.current.pause();
        speechAudioRef.current = null;
      }
      if (speechObjectUrlRef.current) {
        URL.revokeObjectURL(speechObjectUrlRef.current);
        speechObjectUrlRef.current = null;
      }
    };
  }, []);

  const playAssistantSpeech = async (assistantText: string) => {
    const text = assistantText.trim();
    if (!text) return;

    if (speechAudioRef.current) {
      speechAudioRef.current.pause();
      speechAudioRef.current = null;
    }
    if (speechObjectUrlRef.current) {
      URL.revokeObjectURL(speechObjectUrlRef.current);
      speechObjectUrlRef.current = null;
    }

    setIsSpeechPlaying(true);

    let objectUrl: string | null = null;

    const fail = (message: string) => {
      toast({
        title: t("chat.audioFailedTitle"),
        description: message,
        variant: "destructive",
      });
    };

    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const ct = res.headers.get("content-type") ?? "";

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      if (!ct.includes("audio") && !ct.includes("octet-stream")) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? t("chat.audioFailedDescription"));
      }

      const blob = await res.blob();
      if (blob.size < 32) {
        throw new Error(t("chat.audioFailedDescription"));
      }

      objectUrl = URL.createObjectURL(blob);
      speechObjectUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      audio.setAttribute("playsinline", "");
      speechAudioRef.current = audio;

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          if (speechAudioRef.current === audio) {
            speechAudioRef.current = null;
          }
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            if (speechObjectUrlRef.current === objectUrl) {
              speechObjectUrlRef.current = null;
            }
            objectUrl = null;
          }
        };

        audio.onended = () => {
          cleanup();
          resolve();
        };

        audio.onerror = () => {
          cleanup();
          reject(new Error("audio element error"));
        };

        void audio.play().catch((err) => {
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      });
    } catch (e) {
      if (speechAudioRef.current) {
        speechAudioRef.current = null;
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        if (speechObjectUrlRef.current === objectUrl) {
          speechObjectUrlRef.current = null;
        }
      }
      const msg = e instanceof Error ? e.message : t("chat.audioFailedDescription");
      fail(msg);
    } finally {
      setIsSpeechPlaying(false);
    }
  };

  // Called by VoiceInput with partial results while recording
  const handleInterimTranscript = (text: string) => {
    setMessage(text);
  };

  // Called by VoiceInput once final transcription is ready
  const handleTranscript = (text: string) => {
    setMessage(text);
    textareaRef.current?.focus();
  };

  const parseChatError = async (response: Response): Promise<string> => {
    let detail = `Request failed (${response.status})`;
    const ct = response.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      try {
        const data = (await response.json()) as { error?: string; hint?: string; model?: string };
        if (data.error) detail = data.error;
        if (data.hint) detail += ` — ${data.hint}`;
        if (data.model) detail += ` [model: ${data.model}]`;
      } catch {
        /* ignore */
      }
    }
    return detail;
  };

  const readTextStream = async (response: Response): Promise<string> => {
    if (!response.body) throw new Error("No response body");
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let fullResponse = "";
    let done = false;
    while (!done) {
      const { done: isDone, value } = await reader.read();
      done = isDone;
      if (done) break;
      if (value) {
        fullResponse += value;
        setIncomingMessage(fullResponse);
      }
    }
    return fullResponse;
  };

  type InitialNdjsonResult =
    | { ok: true; action: "capture_screen"; assistantContent: unknown }
    | { ok: true; action: null; reply: string }
    | { ok: false; i18nKey: string; values?: Record<string, string> };

  /** First-turn assistant: NDJSON lines `{type:"token"}`, then `{type:"done"}` or `{type:"error"}`. */
  const readNdjsonInitialStream = async (
    response: Response,
    onToken: (delta: string) => void,
  ): Promise<InitialNdjsonResult> => {
    if (!response.body) {
      return { ok: false, i18nKey: "chat.streamErrors.noResponseBody" };
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let streamDone = false;
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
        const rowType = row.type;
        if (rowType === "token" && typeof row.text === "string") {
          onToken(row.text);
          continue;
        }
        if (rowType === "done") {
          const action = row.action;
          if (action === "capture_screen") {
            const assistantContent = row.assistantContent;
            if (assistantContent == null) {
              return { ok: false, i18nKey: "chat.streamErrors.invalidCapture" };
            }
            return { ok: true, action: "capture_screen", assistantContent };
          }
          const reply = typeof row.reply === "string" ? row.reply : "";
          return { ok: true, action: null, reply };
        }
        if (rowType === "error") {
          const err = typeof row.error === "string" ? row.error : "Request failed";
          const hint = typeof row.hint === "string" ? row.hint : "";
          return {
            ok: false,
            i18nKey: "chat.errorWithDetail",
            values: { detail: hint ? `${err} — ${hint}` : err },
          };
        }
      }
    }
    const tail = buffer.trim();
    if (tail) {
      try {
        const parsed: unknown = JSON.parse(tail);
        if (typeof parsed === "object" && parsed !== null && "type" in parsed) {
          const row = parsed as Record<string, unknown>;
          if (row.type === "done") {
            if (row.action === "capture_screen" && row.assistantContent != null) {
              return { ok: true, action: "capture_screen", assistantContent: row.assistantContent };
            }
            if (typeof row.reply === "string") {
              return { ok: true, action: null, reply: row.reply };
            }
          }
          if (row.type === "error") {
            const err = typeof row.error === "string" ? row.error : "Request failed";
            const hint = typeof row.hint === "string" ? row.hint : "";
            return {
              ok: false,
              i18nKey: "chat.errorWithDetail",
              values: { detail: hint ? `${err} — ${hint}` : err },
            };
          }
        }
      } catch {
        /* ignore */
      }
    }
    return { ok: false, i18nKey: "chat.streamErrors.incomplete" };
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
    setIsLoading(true);
    setIncomingMessage("");

    const finishAssistant = (fullResponse: string) => {
      const assistantMessage: MessageWithId = {
        id: (Date.now() + 1).toString(),
        text: fullResponse,
        variant: "assistant",
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIncomingMessage("");
      if (audioModeEnabledRef.current && fullResponse.trim()) {
        void playAssistantSpeech(fullResponse);
      }
    };

    const failAssistant = (reason: string) => {
      const errorMessage: MessageWithId = {
        id: (Date.now() + 1).toString(),
        text: reason,
        variant: "assistant",
        isError: true,
      };
      setIncomingMessage("");
      setMessages((prev) => [...prev, errorMessage]);
      if (audioModeEnabledRef.current && errorMessage.text.trim()) {
        void playAssistantSpeech(errorMessage.text);
      }
    };

    try {
      let response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, history, streaming: true }),
      });

      const ct = response.headers.get("content-type") ?? "";

      if (ct.includes("ndjson") && response.ok) {
        let streamed = "";
        const streamResult = await readNdjsonInitialStream(response, (delta) => {
          streamed += delta;
          setIncomingMessage(streamed);
        });

        if (!streamResult.ok) {
          failAssistant(t(streamResult.i18nKey, streamResult.values ?? {}));
          return;
        }

        if (streamResult.action === "capture_screen") {
          setIncomingMessage(t("chat.capturingScreen"));
          const cap = await captureScreenToPngBase64();
          if (!cap) {
            failAssistant(t("chat.screenCaptureFailed"));
            return;
          }

          response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phase: "complete_screenshot",
              prompt,
              history,
              imageBase64: cap.base64,
              assistantContent: streamResult.assistantContent,
            }),
          });

          if (!response.ok) {
            failAssistant(t("chat.errorWithDetail", { detail: await parseChatError(response) }));
            return;
          }

          const streamCt = response.headers.get("content-type") ?? "";
          if (!streamCt.includes("text/plain")) {
            failAssistant(t("chat.finishScreenFailed"));
            return;
          }

          setIncomingMessage("");
          const fullResponse = await readTextStream(response);
          finishAssistant(fullResponse);
          return;
        }

        const finalText = streamResult.reply.trim() ? streamResult.reply : streamed.trim();
        finishAssistant(finalText || t("chat.emptyResponse"));
        return;
      }

      if (ct.includes("application/json")) {
        const data = (await response.json()) as
          | { error?: string; reply?: string; action?: string; assistantContent?: unknown }
          | Record<string, unknown>;

        if (!response.ok) {
          const msg =
            typeof data.error === "string"
              ? t("chat.errorWithDetail", { detail: data.error })
              : t("chat.assistantUnavailable", { status: String(response.status) });
          failAssistant(msg);
          return;
        }

        if ("error" in data && typeof data.error === "string") {
          failAssistant(t("chat.errorWithDetail", { detail: data.error }));
          return;
        }

        if ("reply" in data && typeof data.reply === "string") {
          finishAssistant(data.reply);
          return;
        }

        if (data.action === "capture_screen" && data.assistantContent) {
          setIncomingMessage(t("chat.capturingScreen"));
          const cap = await captureScreenToPngBase64();
          if (!cap) {
            failAssistant(t("chat.screenCaptureFailed"));
            return;
          }

          response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phase: "complete_screenshot",
              prompt,
              history,
              imageBase64: cap.base64,
              assistantContent: data.assistantContent,
            }),
          });

          if (!response.ok) {
            failAssistant(t("chat.errorWithDetail", { detail: await parseChatError(response) }));
            return;
          }

          const streamCt = response.headers.get("content-type") ?? "";
          if (!streamCt.includes("text/plain")) {
            failAssistant(t("chat.finishScreenFailed"));
            return;
          }

          setIncomingMessage("");
          const fullResponse = await readTextStream(response);
          finishAssistant(fullResponse);
          return;
        }

        failAssistant(t("chat.unexpectedResponse"));
        return;
      }

      if (!response.ok) {
        failAssistant(t("chat.errorWithDetail", { detail: await parseChatError(response) }));
        return;
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const fullResponse = await readTextStream(response);
      finishAssistant(fullResponse);
    } catch (err) {
      const reason = err instanceof Error ? err.message : t("chat.unknownError");
      failAssistant(t("chat.errorWithDetail", { detail: reason }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {showHeader ? (
        <header className="space-y-1">
          <TypographyH2>{t("chat.heading")}</TypographyH2>
          <TypographyP className="text-sm text-muted-foreground">{t("chat.description")}</TypographyP>
        </header>
      ) : null}

      <section className="min-h-0 flex-1 overflow-hidden">
        <ScrollContainer>
          {messages.map((msg) => (
            <Message key={msg.id} text={msg.text} variant={msg.variant} isError={msg.isError} />
          ))}
          {incomingMessage && <Message text={incomingMessage} variant="assistant" />}
          {isLoading && !incomingMessage && <Message text={t("chat.thinking")} variant="assistant" />}
        </ScrollContainer>
      </section>

      <form
        className="interactable flex items-end gap-3"
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <VoiceInput
          onTranscript={handleTranscript}
          onInterimTranscript={handleInterimTranscript}
          disabled={isLoading}
        />

        <div className="relative flex-1">
          {!message ? (
            <TypographySmall className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--placeholder-foreground))]">
              {t("chat.inputPlaceholder")}
            </TypographySmall>
          ) : null}
          <Textarea
            ref={textareaRef}
            placeholder=""
            rows={1}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isLoading}
            aria-label={t("chat.inputPlaceholder")}
            className="interactable !min-h-[calc(2.5rem*var(--text-scale))] flex-1 resize-none py-2 !text-[calc(1rem*var(--text-scale))] leading-snug text-white"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isLoading && message.trim()) {
                  e.currentTarget.form?.requestSubmit();
                }
              }
            }}
          />
        </div>
        <Button
          type="submit"
          disabled={isLoading || !message.trim()}
          className="interactable !h-[calc(2.5rem*var(--text-scale))] !w-[calc(2.5rem*var(--text-scale))] shrink-0 p-0"
        >
          <Send className="h-[calc(1rem*var(--text-scale))] w-[calc(1rem*var(--text-scale))]" />
        </Button>
      </form>
    </div>
  );
}
