import { createServerSupabaseClient } from "@/lib/server-utils";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { getUserProfile } from "@/lib/utils";
import type { Database } from "@/lib/schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import ProfilePageView from "./profile-page-view";

export default async function Settings() {
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

  const { profile, error } = await getUserProfile(supabase as SupabaseClient<Database>, user);

  return <ProfilePageView profile={profile} errorMessage={error?.message} />;
}
