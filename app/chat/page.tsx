"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { Send } from "lucide-react";
import { Message, type MessageProps } from "./message";
import { ScrollContainer } from "./scroll-container";

type MessageWithId = MessageProps & { id: string; variant: "user" | "assistant" };
interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export default function Chat() {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<MessageWithId[]>([]);
  const [incomingMessage, setIncomingMessage] = useState("");
  const [audioModeEnabled, setAudioModeEnabled] = useState(false);
  const { t } = useTranslation();

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

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, history }),
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
      setIncomingMessage("");
    } catch {
      // Error occurred while fetching response
      const errorMessage: MessageWithId = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, there was an error processing your request.",
        variant: "assistant",
      };
      setIncomingMessage("");
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6">
			<header className="space-y-1">
				<TypographyH2>{t("chat.heading")}</TypographyH2>
				<TypographyP className="text-sm text-muted-foreground">
					{t("chat.description")}
				</TypographyP>
			</header>

      <section className="h-96 overflow-hidden">
        <ScrollContainer>
          {messages.map((msg) => (
            <Message key={msg.id} text={msg.text} variant={msg.variant} />
          ))}
          {incomingMessage && <Message text={incomingMessage} variant="assistant" />}
          {isLoading && !incomingMessage && <Message text="Thinking..." variant="assistant" />}
        </ScrollContainer>
      </section>

        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
        >
          <Button
            type="button"
            variant={audioModeEnabled ? "default" : "outline"}
            className={
              audioModeEnabled
                ? "shrink-0 ring-2 ring-primary/40"
                : "shrink-0 text-muted-foreground"
            }
            aria-pressed={audioModeEnabled}
            onClick={() => setAudioModeEnabled((prev) => !prev)}
          >
            {audioModeEnabled ? "Audio Mode: On" : "Audio Mode: Off"}
          </Button>
          <Input
            placeholder={t("chat.inputPlaceholder")}
            className="flex-1"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
  );
}
