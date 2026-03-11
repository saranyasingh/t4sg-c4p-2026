import { createServerSupabaseClient } from "@/lib/server-utils";
import { getUserProfile } from "@/lib/utils";
import { redirect } from "next/navigation";
import ProfilePageView from "./profile-page-view";

export default async function Settings() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { profile, error } = await getUserProfile(supabase, user);

  return <ProfilePageView profile={profile} errorMessage={error?.message} />;
}
