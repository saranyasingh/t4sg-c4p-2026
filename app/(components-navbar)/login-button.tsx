"use client";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { createBrowserSupabaseClient } from "@/lib/client-utils";
import { useTranslation } from "react-i18next";

export default function LoginButton() {
  const { t } = useTranslation();
  const supabase = createBrowserSupabaseClient();

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      return toast({
        title: t("auth.somethingWentWrong"),
        description: error.message,
        variant: "destructive",
      });
    }

    return;
  };
  return <Button onClick={handleSignIn}>{t("auth.loginWithGoogle")}</Button>;
}
