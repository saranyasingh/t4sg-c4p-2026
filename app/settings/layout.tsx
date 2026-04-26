import type React from "react";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { createServerSupabaseClient } from "@/lib/server-utils";
import { redirect } from "next/navigation";
import SettingsLayoutClient from "./settings-layout-client";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default async function SettingsLayout({ children }: SettingsLayoutProps) {
  if (!isSupabaseConfigured()) {
    redirect("/");
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return <SettingsLayoutClient>{children}</SettingsLayoutClient>;
}
