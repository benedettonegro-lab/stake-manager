"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";

type ProfileStatus = "pending" | "approved" | "blocked";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("status, role")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error || !profile) {
        await supabase.auth.signOut();
        return;
      }

      const status = profile.status as ProfileStatus | null;

      if (status === "approved") {
        setAllowed(true);
        return;
      }

      await supabase.auth.signOut();
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A1020] text-white">
        <div className="rounded-2xl border border-white/[0.06] bg-[#11182B] px-4 py-3 text-sm sm:px-6 sm:py-4 sm:text-sm text-[#8B93A7]">
          Caricamento…
        </div>
      </div>
    );
  }

  return children;
}

