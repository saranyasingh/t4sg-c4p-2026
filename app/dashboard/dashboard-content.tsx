"use client";

import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";

export default function DashboardContent({
  userEmail,
  configurationMissing,
}: {
  userEmail?: string | null;
  configurationMissing?: boolean;
}) {
  const { t } = useTranslation();

  if (configurationMissing) {
    return (
      <>
        <TypographyH2>{t("dashboard.heading")}</TypographyH2>
        <TypographyP>{t("dashboard.notConfigured")}</TypographyP>
      </>
    );
  }

  return (
    <>
      <TypographyH2>{t("dashboard.heading")}</TypographyH2>
      <TypographyP>{t("dashboard.description")}</TypographyP>
      {userEmail ? <TypographyP>{t("dashboard.signedInAs", { email: userEmail })}</TypographyP> : null}
    </>
  );
}
