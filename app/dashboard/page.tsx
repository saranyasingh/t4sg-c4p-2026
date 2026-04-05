import { createServerSupabaseClient } from "@/lib/server-utils";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { redirect } from "next/navigation";
import DashboardContent from "./dashboard-content";

export default async function Dashboard() {
  if (!isSupabaseConfigured()) {
    return <DashboardContent configurationMissing />;
  }

  // Create supabase server component client and obtain user session from Supabase Auth
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // this is a protected route - only users who are signed in can view this route

    /*
      Be careful when protecting pages. The server gets the user session from the cookies, which can be spoofed by anyone.
      Always use supabase.auth.getUser() to protect pages and user data.
      Never trust supabase.auth.getSession() inside server code such as middleware. It isn't guaranteed to revalidate the Auth token.
      It's safe to trust getUser() because it sends a request to the Supabase Auth server every time to revalidate the Auth token.
    */

    redirect("/");
  }

  return <DashboardContent userEmail={user.email} />;
}
