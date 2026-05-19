"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  clearProfileGateCache,
  readProfileApprovedCache,
  writeProfileApprovedCache,
} from "@/lib/profile-gate-cache";
import { isLikelyOfflineOrNetworkError } from "@/lib/supabase-network";
import { useAppCacheStore } from "@/stores/app-cache-store";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

type ProfileStatus = "pending" | "approved" | "blocked";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [phase, setPhase] = useState<"checking" | "denied">("checking");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (!uid || cancelled) return;
      if (readProfileApprovedCache(uid)) {
        useAppCacheStore.getState().setUserId(uid);
        startTransition(() => setAllowed(true));
      }
    });

    async function ensureProfile(userId: string): Promise<boolean> {
      if (readProfileApprovedCache(userId)) {
        startTransition(() => setAllowed(true));
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("status, role")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return false;
      if (error || !profile) {
        if (readProfileApprovedCache(userId) && isLikelyOfflineOrNetworkError(error)) {
          return true;
        }
        clearProfileGateCache();
        if (!isLikelyOfflineOrNetworkError(error)) {
          await supabase.auth.signOut();
        }
        return false;
      }

      const status = profile.status as ProfileStatus | null;
      if (status === "approved") {
        writeProfileApprovedCache(userId);
        return true;
      }

      clearProfileGateCache();
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
        clearProfileGateCache();
        setPhase("denied");
        router.replace("/login?reason=session");
        return;
      }

      if (readProfileApprovedCache(user.id)) {
        startTransition(() => setAllowed(true));
      }

      const ok = await ensureProfile(user.id);
      if (cancelled) return;

      if (!ok) {
        setAllowed(false);
        setPhase("denied");
        router.replace("/login?reason=missing-profile");
        return;
      }

      startTransition(() => setAllowed(true));
    }

    void run();

    const onVisible = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      void supabase.auth.getSession();
    };
    document.addEventListener("visibilitychange", onVisible);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: Session | null) => {
      if (cancelled) return;

      if (event === "SIGNED_OUT") {
        clearProfileGateCache();
        setAllowed(false);
        setPhase("denied");
        router.replace("/login?reason=session");
        return;
      }

      const needsProfileRecheck =
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED" ||
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION";

      if (needsProfileRecheck) {
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
        startTransition(() => setAllowed(true));
      }
    });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      subscription.unsubscribe();
    };
  }, [router]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1224] text-white">
        <div className="sm-auth-gate-panel rounded-2xl border border-white/[0.06] bg-[#12192A] px-4 py-3 text-sm sm:px-6 sm:py-4 sm:text-sm text-[#8B93A7]">
          {phase === "denied" ? "Reindirizzamento…" : "Caricamento…"}
        </div>
      </div>
    );
  }

  return (
    <div className="sm-app-content-enter">{children}</div>
  );
}
