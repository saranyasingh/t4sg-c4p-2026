"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const currentLng = i18n.language?.split("-")[0] ?? "en";

  const label = currentLng === "es" ? t("languageSelector.es") : t("languageSelector.en");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="interactable gap-2 overflow-hidden">
          <Languages className="h-4 w-4 shrink-0" />
          <span className="sr-only">{t("languageSelector.label")}</span>
          <span key={currentLng} className="min-w-[4.5rem] truncate text-left" aria-hidden>
            {label}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[1000000]">
        <DropdownMenuItem onClick={() => i18n.changeLanguage("en")}>{t("languageSelector.en")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => i18n.changeLanguage("es")}>{t("languageSelector.es")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
