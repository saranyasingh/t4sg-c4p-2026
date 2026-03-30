"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { ImageIcon, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ScreenshotButton from "../screenshot-button";
import { Message, type MessageProps } from "./message";
import { ScrollContainer } from "./scroll-container";
import { VoiceInput } from "./voice-input"; // ← NEW

type MessageWithId = MessageProps & { id: string; variant: "user" | "assistant" };
interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

interface ChatProps {
  showHeader?: boolean;
}

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
  const [pendingScreenshot, setPendingScreenshot] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null); // ← NEW: for refocusing after transcript

  audioModeEnabledRef.current = audioModeEnabled;

  const { t } = useTranslation();

  useEffect(() => {
    setNewMessageSignal((n) => n + 1);
  }, [messages, incomingMessage, isLoading]);

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

  // Called by VoiceInput with partial results while recording
  const handleInterimTranscript = (text: string) => {
    setMessage(text);
  };

  // Called by VoiceInput once final transcription is ready
  const handleTranscript = (text: string) => {
    setMessage(text);
    inputRef.current?.focus();
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

    const screenshotToSend = pendingScreenshot;
    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setIsLoading(true);
    setIncomingMessage("");
    setNewMessageSignal((prev) => prev + 1);
    setPendingScreenshot(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, history, imageBase64: screenshotToSend }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to stream response");
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let fullResponse = "";

      let done = false;

      while (!done) {
        const { done: isDone, value } = await reader.read();
        done = isDone;

        if (done) {
          break;
        }

        if (value) {
          fullResponse += value;
          setIncomingMessage(fullResponse);
        }
      }

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
    } catch {
      const errorMessage: MessageWithId = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, there was an error processing your request.",
        variant: "assistant",
      };
      setIncomingMessage("");
      setMessages((prev) => [...prev, errorMessage]);

      if (audioModeEnabledRef.current && errorMessage.text.trim()) {
        void playAssistantSpeech(errorMessage.text);
      }
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

      {pendingScreenshot && (
        <div className="interactable flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
          <ImageIcon className="interactable h-4 w-4 text-muted-foreground" />
          <span className="interactable text-sm text-muted-foreground">Screenshot attached</span>
          <img
            src={`data:image/png;base64,${pendingScreenshot}`}
            alt="Screenshot preview"
            className="h-10 rounded border"
          />
          <Button variant="ghost" size="sm" onClick={() => setPendingScreenshot(null)} type="button">
            <X className="interactable h-3 w-3" />
          </Button>
        </div>
      )}

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
        <ScreenshotButton onScreenshot={setPendingScreenshot} />

        {/* ← NEW: mic button sits between screenshot and text input */}
        <VoiceInput
          onTranscript={handleTranscript}
          onInterimTranscript={handleInterimTranscript}
          disabled={isLoading}
        />

        <Input
          ref={inputRef} // ← NEW
          placeholder={t("chat.inputPlaceholder")}
          className="interactable flex-1"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading || !message.trim()} className="interactable">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
