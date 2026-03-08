'use client';

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { Send } from "lucide-react";
import { ScrollContainer } from "./scroll-container";
import { Message, type MessageProps } from "./message";

type MessageWithId = MessageProps & { id: string; variant: "user" | "assistant" };

export default function Chat() {
	const { t } = useTranslation();
	const [message, setMessage] = useState("");
	const [messages, setMessages] = useState<MessageWithId[]>([
		{
			id: "1",
			text: "This is a test message.",
			variant: "user",
		},
		{
			id: "2",
			text: "I'm an Assistant for Granson AI!",
			variant: "assistant",
		},
		{
			id: "3",
			text: "This is a scroll container.",
			variant: "user",
		},
		{
			id: "4",
			text: "It sure is.",
			variant: "assistant",
		},
		{
			id: "5",
			text: "Make sure to replace these hardcoded messages with actual messaging functionality.",
			variant: "user",
		},
	]);

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!message.trim()) return;

		const newMessage: MessageWithId = {
			id: Date.now().toString(),
			text: message,
			variant: "user",
		};

		setMessages((prev) => [...prev, newMessage]);
		setMessage("");
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
						<Message
							key={msg.id}
							text={msg.text}
							variant={msg.variant}
						/>
					))}
        </ScrollContainer>
			</section>

			<form className="flex items-center gap-3" onSubmit={handleSubmit}>
				<Input
					placeholder={t("chat.inputPlaceholder")}
					className="flex-1"
					value={message}
					onChange={(e) => setMessage(e.target.value)}
				/>
				<Button type="submit">
					<Send className="h-4 w-4" />
				</Button>
			</form>
		</div>
	);
}
