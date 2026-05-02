import { createServerSupabaseClient } from "@/lib/server-utils";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { redirect } from "next/navigation";
import type React from "react";
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
