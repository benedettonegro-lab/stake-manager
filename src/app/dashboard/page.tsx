import { DashboardAnalytics } from "./dashboard-analytics";
import { AppShell } from "@/components/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase.server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell title="Home">
      <DashboardAnalytics />
    </AppShell>
  );
}
