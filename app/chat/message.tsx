"use client";

import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";

export interface MessageProps {
  text: string;
  variant?: "user" | "assistant";
}

export const Message = ({ text, variant = "user" }: MessageProps) => {
  const { t } = useTranslation();
  const sender = variant === "user" ? t("chat.senderUser") : t("chat.senderAssistant");

  return (
    <div
      className={cn(
        "rounded-md p-3 text-white",
        variant === "user" ? "bg-[hsl(var(--background)/0.22)]" : "bg-[hsl(var(--primary)/0.45)]",
      )}
    >
      <TypographyP className="text-sm font-semibold text-white/90">{sender}</TypographyP>
      <div className="text-sm text-white whitespace-pre-wrap break-words">
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
    </div>
  );
};
