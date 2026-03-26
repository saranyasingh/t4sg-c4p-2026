"use client";

import { TypographyH3 } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";

// https://nextjs.org/docs/app/api-reference/file-conventions/not-found

export default function NotFound() {
  const { t } = useTranslation();
  return <TypographyH3>{t("misc.notFound")}</TypographyH3>;
}
