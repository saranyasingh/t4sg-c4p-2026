"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { Send } from "lucide-react";
import { Message, type MessageProps } from "./message";
import { ScrollContainer } from "./scroll-container";
import { captureDesktopScreenshot } from "@/app/lib/desktop-screenshot";

type MessageWithId = MessageProps & { id: string; variant: "user" | "assistant" };
interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

interface ChatProps {
  showHeader?: boolean;
}

type CaptureScreenPayload = {
  action: "capture_screen";
  assistantMessage: {
    content: string | null;
    tool_calls: unknown;
  };
};

export function Chat({ showHeader = true }: ChatProps) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<MessageWithId[]>([]);
  const [incomingMessage, setIncomingMessage] = useState("");
  const [audioModeEnabled, setAudioModeEnabled] = useState(false);
  const [isSpeechPlaying, setIsSpeechPlaying] = useState(false);
  const [newMessageSignal, setNewMessageSignal] = useState(0);
  const audioModeEnabledRef = useRef(audioModeEnabled);
  const speechObjectUrlRef = useRef<string | null>(null);
  const speechAudioRef = useRef<HTMLAudioElement | null>(null);

  audioModeEnabledRef.current = audioModeEnabled;

  const { t } = useTranslation();

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

    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        throw new Error("speak request failed");
      }

      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      speechObjectUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
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
          reject(err);
        });
      });
    } catch {
      if (speechAudioRef.current) {
        speechAudioRef.current = null;
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        if (speechObjectUrlRef.current === objectUrl) {
          speechObjectUrlRef.current = null;
        }
      }
    } finally {
      setIsSpeechPlaying(false);
    }
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
      .slice(-10);

    const userMessage: MessageWithId = {
      id: Date.now().toString(),
      text: prompt,
      variant: "user",
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setIsLoading(true);
    setIncomingMessage("");
    setNewMessageSignal((prev) => prev + 1);

    const finishAssistant = async (fullResponse: string) => {
      const assistantMessage: MessageWithId = {
        id: (Date.now() + 1).toString(),
        text: fullResponse,
        variant: "assistant",
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setNewMessageSignal((prev) => prev + 1);
      setIncomingMessage("");
      if (audioModeEnabledRef.current && fullResponse.trim()) {
        void playAssistantSpeech(fullResponse);
      }
    };

    const failAssistant = async (errText: string) => {
      const errorMessage: MessageWithId = {
        id: (Date.now() + 1).toString(),
        text: errText,
        variant: "assistant",
      };
      setIncomingMessage("");
      setMessages((prev) => [...prev, errorMessage]);
      if (audioModeEnabledRef.current && errText.trim()) {
        void playAssistantSpeech(errText);
      }
    };

    try {
      let res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, history }),
      });

      if (!res.ok) {
        await failAssistant("Sorry, the assistant is unavailable right now.");
        return;
      }

      const ct = res.headers.get("content-type") ?? "";

      if (ct.includes("application/json")) {
        const data = (await res.json()) as CaptureScreenPayload | { reply?: string; error?: string };

        if ("error" in data && data.error) {
          await failAssistant(`Sorry, something went wrong: ${data.error}`);
          return;
        }

        if ("reply" in data && typeof data.reply === "string") {
          await finishAssistant(data.reply);
          return;
        }

        if ("action" in data && data.action === "capture_screen" && data.assistantMessage) {
          const cap = await captureDesktopScreenshot();
          if (!cap) {
            await failAssistant(
              "I tried to view your screen but could not capture it (permission denied or not running in the desktop app). You can describe what you see instead.",
            );
            return;
          }

          res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phase: "complete_screenshot",
              prompt,
              history,
              imageBase64: cap.base64,
              assistantMessage: data.assistantMessage,
            }),
          });
          if (!res.ok) {
            await failAssistant("Sorry, I could not finish analyzing your screen.");
            return;
          }
        } else {
          await failAssistant("Sorry, there was an error processing your request.");
          return;
        }
      }

      if (!res.ok || !res.body) {
        throw new Error("Failed to stream response");
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
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

      await finishAssistant(fullResponse);
    } catch {
      await failAssistant("Sorry, there was an error processing your request.");
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

      <Button
        type="button"
        variant={audioModeEnabled ? "default" : "outline"}
        className={
          audioModeEnabled
            ? "interactable shrink-0 ring-2 ring-primary/40"
            : "interactable shrink-0 text-muted-foreground"
        }
        aria-pressed={audioModeEnabled}
        aria-busy={isSpeechPlaying}
        onClick={() => setAudioModeEnabled((prev) => !prev)}
      >
        {audioModeEnabled ? "Audio Mode: On" : "Audio Mode: Off"}
        {isSpeechPlaying ? " · Playing" : ""}
      </Button>

      <section className="min-h-0 flex-1 overflow-hidden">
        <ScrollContainer newMessageSignal={newMessageSignal}>
          {messages.map((msg) => (
            <Message key={msg.id} text={msg.text} variant={msg.variant} />
          ))}
          {incomingMessage && <Message text={incomingMessage} variant="assistant" />}
          {isLoading && !incomingMessage && <Message text="Thinking..." variant="assistant" />}
        </ScrollContainer>
      </section>

      <form
        className="interactable flex items-center gap-3"
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <Input
          placeholder={t("chat.inputPlaceholder")}
          className="interactable flex-1"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading} className="interactable">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
