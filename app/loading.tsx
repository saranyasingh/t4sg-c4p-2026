"use client";

import { TypographyH2 } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";

export default function Loading() {
  const { t } = useTranslation();
  return <TypographyH2>{t("misc.loading")}</TypographyH2>;
}
