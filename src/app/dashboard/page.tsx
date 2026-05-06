import { DashboardAnalytics } from "./dashboard-analytics";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";

export default function DashboardPage() {
  return (
    <AuthGate>
      <AppShell title="Home">
        <DashboardAnalytics />
      </AppShell>
    </AuthGate>
  );
}
