"use client";

import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "../language-selector";
import { useAudioMode } from "../audio-mode-context";

const SILENT_WAV =
	"data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==";

export default function Settings() {
	const { t } = useTranslation();
	const { audioModeEnabled, setAudioModeEnabled } = useAudioMode();

	return (
		<div className="flex h-full flex-col gap-6 p-6">
			<div className="shrink-0 space-y-2">
				<TypographyH2>{t("options.heading")}</TypographyH2>
				<TypographyP className="text-white/80">{t("options.description")}</TypographyP>
			</div>

			<div className="flex flex-col gap-8">
				<div className="space-y-3">
					<TypographyP className="font-semibold text-white">{t("languageSelector.label")}</TypographyP>
					<LanguageSelector />
				</div>

				<div className="space-y-3">
					<TypographyP className="font-semibold text-white">{t("chat.heading")}</TypographyP>
					<Button
						type="button"
						variant={audioModeEnabled ? "default" : "outline"}
						className={audioModeEnabled ? "interactable ring-2 ring-primary/40" : "interactable text-muted-foreground"}
						aria-pressed={audioModeEnabled}
						onClick={() => {
							const next = !audioModeEnabled;
							if (next) {
								const unlock = new Audio(SILENT_WAV);
								unlock.volume = 0.01;
								void unlock.play().catch(() => {
									/* ignore */
								});
							}
							setAudioModeEnabled(next);
						}}
					>
						{audioModeEnabled ? t("chat.audioModeOn") : t("chat.audioModeOff")}
					</Button>
				</div>
			</div>
		</div>
	);
}
