"use client";

import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";

export default function DashboardContent({ userEmail }: { userEmail?: string | null }) {
  const { t } = useTranslation();

  return (
    <>
      <TypographyH2>{t("dashboard.heading")}</TypographyH2>
      <TypographyP>{t("dashboard.description")}</TypographyP>
      {userEmail && <TypographyP>{`Your email is ${userEmail}`}</TypographyP>}
    </>
  );
}
