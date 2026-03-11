import { createServerSupabaseClient } from "@/lib/server-utils";
import { redirect } from "next/navigation";
import SettingsLayoutClient from "./settings-layout-client";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default async function SettingsLayout({ children }: SettingsLayoutProps) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return <SettingsLayoutClient>{children}</SettingsLayoutClient>;
}
