"use client";

import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

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
				"p-3 rounded-md",
				variant === "user" ? "bg-muted" : "bg-primary/10"
			)}
		>
			<TypographyP className="text-sm font-semibold">{sender}</TypographyP>
			<TypographyP className="text-sm">{text}</TypographyP>
		</div>
	);
};
