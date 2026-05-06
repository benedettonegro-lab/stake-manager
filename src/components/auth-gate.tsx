"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";

type ProfileStatus = "pending" | "approved" | "blocked";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [allowed, setAllowed] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setBlocked("NO_USER");
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
        setBlocked("MISSING_PROFILE");
        return;
      }

      const status = profile.status as ProfileStatus | null;

      if (status === "approved") {
        setAllowed(true);
        return;
      }

      await supabase.auth.signOut();
      setBlocked("NOT_APPROVED");
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[#94a3b8]">
        Accesso bloccato (DEBUG AUTH){blocked ? `: ${blocked}` : "…"}
      </div>
    );
  }

  return children;
}

