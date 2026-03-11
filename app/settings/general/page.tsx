"use client";

import { TypographyP } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";

export default function GeneralSettings() {
  const { t } = useTranslation();
  return <TypographyP>{t("settings.editGeneral")}</TypographyP>;
}
