"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  clearProfileGateCache,
  readLastKnownUserId,
  readProfileApprovedCache,
  readProfileApprovedOrStale,
  writeProfileApprovedCache,
} from "@/lib/profile-gate-cache";
import { resolveAppSession } from "@/lib/resolve-session";
import {
  clearCachedSessionUserId,
  readCachedSessionUserId,
  writeCachedSessionUserId,
} from "@/lib/session-user-cache";
import { isLikelyOfflineOrNetworkError } from "@/lib/supabase-network";
import { useAppCacheStore } from "@/stores/app-cache-store";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const GATE_RELEASE_MS = 1500;
const FAST_SESSION_MS = 1200;
const PROFILE_QUERY_MS = 5000;

type ProfileStatus = "pending" | "approved" | "blocked";

function pickCachedUserId(): string | null {
  return (
    useAppCacheStore.getState().userId ??
    readCachedSessionUserId() ??
    readLastKnownUserId()
  );
}

function syncUserId(uid: string) {
  useAppCacheStore.getState().setUserId(uid);
  writeCachedSessionUserId(uid);
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

/**
 * Non blocca mai l’app: shell + bottom nav subito; verifica auth/profilo in background.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [verifying, setVerifying] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const redirectingRef = useRef(false);

  const redirectToLogin = useCallback((reason: string) => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    router.replace(`/login?reason=${reason}`);
  }, [router]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    const stopVerifying = () => {
      if (!cancelled) setVerifying(false);
    };

    const releaseTimer = window.setTimeout(stopVerifying, GATE_RELEASE_MS);

    const cachedUid = pickCachedUserId();
    if (cachedUid && readProfileApprovedOrStale(cachedUid)) {
      syncUserId(cachedUid);
    }

    async function ensureProfile(userId: string): Promise<"ok" | "denied" | "offline"> {
      if (readProfileApprovedCache(userId)) return "ok";

      try {
        const { data: profile, error } = await withTimeout(
          supabase
            .from("profiles")
            .select("status, role")
            .eq("id", userId)
            .maybeSingle(),
          PROFILE_QUERY_MS,
        );

        if (cancelled) return "offline";

        if (error || !profile) {
          if (readProfileApprovedOrStale(userId) && isLikelyOfflineOrNetworkError(error)) {
            return "offline";
          }
          if (!error && !profile && readProfileApprovedOrStale(userId)) {
            return "offline";
          }
          return "denied";
        }

        const status = profile.status as ProfileStatus | null;
        if (status === "approved") {
          writeProfileApprovedCache(userId);
          return "ok";
        }
        return "denied";
      } catch (e) {
        if (readProfileApprovedOrStale(userId) && isLikelyOfflineOrNetworkError(e)) {
          return "offline";
        }
        return "denied";
      }
    }

    async function run() {
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), FAST_SESSION_MS);
        const uid = data.session?.user?.id;
        if (uid && !cancelled) {
          syncUserId(uid);
          stopVerifying();
        }
      } catch {
        /* timeout / storage — continua con resolveAppSession */
      }

      const { user, error: sessionError } = await resolveAppSession(supabase);
      if (cancelled) return;
      stopVerifying();

      if (!user) {
        const fallbackUid = pickCachedUserId();
        if (fallbackUid && isLikelyOfflineOrNetworkError(sessionError)) {
          syncUserId(fallbackUid);
          setNotice("Connessione limitata — dati in cache");
          return;
        }
        if (fallbackUid && readProfileApprovedOrStale(fallbackUid)) {
          syncUserId(fallbackUid);
          setNotice("Verifica sessione…");
          return;
        }
        clearProfileGateCache();
        clearCachedSessionUserId();
        useAppCacheStore.getState().setUserId(null);
        redirectToLogin("session");
        return;
      }

      syncUserId(user.id);

      const profileResult = await ensureProfile(user.id);
      if (cancelled) return;

      if (profileResult === "ok") {
        setNotice(null);
        return;
      }
      if (profileResult === "offline") {
        setNotice("Offline — profilo in cache");
        return;
      }

      clearProfileGateCache();
      clearCachedSessionUserId();
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      useAppCacheStore.getState().setUserId(null);
      redirectToLogin("missing-profile");
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
        clearCachedSessionUserId();
        useAppCacheStore.getState().setUserId(null);
        redirectToLogin("session");
        return;
      }

      const needsProfileRecheck =
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED" ||
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION";

      if (!needsProfileRecheck) return;

      const uid = session?.user?.id;
      if (!uid) return;

      syncUserId(uid);
      const profileResult = await ensureProfile(uid);
      if (cancelled) return;

      if (profileResult === "denied") {
        clearProfileGateCache();
        clearCachedSessionUserId();
        try {
          await supabase.auth.signOut();
        } catch {
          /* ignore */
        }
        useAppCacheStore.getState().setUserId(null);
        redirectToLogin("missing-profile");
        return;
      }

      if (profileResult === "offline") {
        setNotice("Offline — profilo in cache");
        return;
      }

      setNotice(null);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(releaseTimer);
      document.removeEventListener("visibilitychange", onVisible);
      subscription.unsubscribe();
    };
  }, [redirectToLogin, router]);

  return (
    <>
      {verifying ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-white/[0.06]"
          aria-hidden
        >
          <div className="h-full w-1/3 animate-[sm-shimmer_0.9s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[#A970FF]/70 to-transparent" />
        </div>
      ) : null}
      {notice ? (
        <div className="sm-app-constrain pointer-events-none fixed inset-x-0 top-0 z-[99] mx-auto px-2 pt-[env(safe-area-inset-top,0px)]">
          <p
            className="rounded-b-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-center text-xs text-amber-100/90"
            role="status"
          >
            {notice}
          </p>
        </div>
      ) : null}
      <div className="sm-app-content-enter">{children}</div>
    </>
  );
}
