"use client";

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Languages } from "lucide-react";

export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const currentLng = i18n.language?.split("-")[0] ?? "en";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Languages className="h-4 w-4" />
          <span className="sr-only">{t("languageSelector.label")}</span>
          <span aria-hidden>{currentLng === "es" ? t("languageSelector.es") : t("languageSelector.en")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => i18n.changeLanguage("en")}>
          {t("languageSelector.en")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => i18n.changeLanguage("es")}>
          {t("languageSelector.es")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
