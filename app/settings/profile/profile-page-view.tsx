"use client";

import { Separator } from "@/components/ui/separator";
import { type Database } from "@/lib/schema";
import { useTranslation } from "react-i18next";
import ProfileForm from "./profile-form";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

function SettingsError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <>
      <h3 className="text-lg font-medium">{t("profileForm.errorHeading")}</h3>
      <p>{message}</p>
    </>
  );
}

export default function ProfilePageView({
  profile,
  errorMessage,
}: {
  profile: Profile | null;
  errorMessage?: string | null;
}) {
  const { t } = useTranslation();

  if (errorMessage) {
    return <SettingsError message={errorMessage} />;
  }

  if (!profile) {
    return null;
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">{t("profileForm.heading")}</h3>
          <p className="text-sm text-muted-foreground">{t("profileForm.siteDescription")}</p>
        </div>
        <Separator />
        <ProfileForm profile={profile} />
      </div>
    </>
  );
}
