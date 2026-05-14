"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ProfileStatus = "pending" | "approved" | "blocked";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [phase, setPhase] = useState<"checking" | "denied">("checking");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    async function ensureProfile(userId: string): Promise<boolean> {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("status, role")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return false;
      if (error || !profile) {
        await supabase.auth.signOut();
        return false;
      }

      const status = profile.status as ProfileStatus | null;
      if (status === "approved") return true;

      await supabase.auth.signOut();
      return false;
    }

    async function run() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (error || !user) {
        setPhase("denied");
        router.replace("/login?reason=session");
        return;
      }

      const ok = await ensureProfile(user.id);
      if (cancelled) return;

      if (!ok) {
        setPhase("denied");
        router.replace("/login?reason=missing-profile");
        return;
      }

      setAllowed(true);
    }

    void run();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: Session | null) => {
      if (cancelled) return;

      if (event === "SIGNED_OUT") {
        setAllowed(false);
        setPhase("denied");
        router.replace("/login?reason=session");
        return;
      }

      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        const uid = session?.user?.id;
        if (!uid) return;
        const ok = await ensureProfile(uid);
        if (cancelled) return;
        if (!ok) {
          setAllowed(false);
          setPhase("denied");
          router.replace("/login?reason=missing-profile");
          return;
        }
        setAllowed(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1224] text-white">
        <div className="rounded-2xl border border-white/[0.06] bg-[#12192A] px-4 py-3 text-sm sm:px-6 sm:py-4 sm:text-sm text-[#8B93A7]">
          {phase === "denied" ? "Reindirizzamento…" : "Caricamento…"}
        </div>
      </div>
    );
  }

  return children;
}
