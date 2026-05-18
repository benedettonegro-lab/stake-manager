import dynamic from "next/dynamic";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";

const DashboardAnalytics = dynamic(
  () => import("./dashboard-analytics").then((m) => ({ default: m.DashboardAnalytics })),
  {
    loading: () => (
      <div className="space-y-3 px-1 py-2" aria-busy aria-label="Caricamento dashboard">
        <div className="h-24 animate-pulse rounded-2xl bg-white/[0.06] motion-reduce:animate-none" />
        <div className="h-40 animate-pulse rounded-2xl bg-white/[0.05] motion-reduce:animate-none" />
        <div className="h-32 animate-pulse rounded-2xl bg-white/[0.04] motion-reduce:animate-none" />
      </div>
    ),
  },
);

export default function DashboardPage() {
  return (
    <AuthGate>
      <AppShell title="Home">
        <div className="sm-route-enter">
          <DashboardAnalytics />
        </div>
      </AppShell>
    </AuthGate>
  );
}
