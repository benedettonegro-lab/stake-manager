"use client";

import { devPageLog } from "@/lib/dev-log";
import { resolveAppSession } from "@/lib/resolve-session";
import {
  readCachedSessionUserId,
  writeCachedSessionUserId,
} from "@/lib/session-user-cache";
import { isLikelyOfflineOrNetworkError } from "@/lib/supabase-network";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAppCacheStore } from "@/stores/app-cache-store";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const STALE_MS = 45_000;
const GATE_RELEASE_MS = 1500;

export type UsePageLoadResult = {
  /** Sempre true dopo il primo frame — niente skeleton full-page. */
  ready: boolean;
  userId: string | null;
  loadError: string | null;
  isRefreshing: boolean;
  /** true dopo il primo fetch rete (abilita realtime) */
  initialFetchComplete: boolean;
  retry: () => void;
  clearError: () => void;
};

type UsePageLoadOptions = {
  page: string;
  fetch: (userId: string) => Promise<void>;
  hydrateFromCache?: (userId: string) => Promise<boolean> | boolean;
  /** Forza refetch anche se cache pagina è fresca */
  force?: boolean;
};

function pickUserId(): string | null {
  return useAppCacheStore.getState().userId ?? readCachedSessionUserId();
}

export function usePageLoad({
  page,
  fetch,
  hydrateFromCache,
  force = false,
}: UsePageLoadOptions): UsePageLoadResult {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const fetchRef = useRef(fetch);
  const hydrateRef = useRef(hydrateFromCache);

  useEffect(() => {
    fetchRef.current = fetch;
    hydrateRef.current = hydrateFromCache;
  });

  const [ready] = useState(true);
  const [userId, setUserId] = useState<string | null>(() => pickUserId());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialFetchComplete, setInitialFetchComplete] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const runIdRef = useRef(0);

  useEffect(() => {
    const runId = ++runIdRef.current;
    let cancelled = false;
    const isStale = () => cancelled || runIdRef.current !== runId;

    const release = () => {
      if (!isStale()) setInitialFetchComplete(true);
    };

    const releaseTimer = window.setTimeout(release, GATE_RELEASE_MS);

    const run = async () => {
      devPageLog(page, "instant load start");

      let uid = pickUserId();
      if (uid && !isStale()) {
        setUserId(uid);
      }

      if (!uid) {
        const { user, error: sessionError } = await resolveAppSession(supabase);
        if (isStale()) return;

        if (!user) {
          const fallback = pickUserId();
          if (fallback && isLikelyOfflineOrNetworkError(sessionError)) {
            uid = fallback;
            useAppCacheStore.getState().setUserId(uid);
            devPageLog(page, "session offline, use cache uid");
          } else {
            devPageLog(page, "session missing", sessionError);
            release();
            if (!fallback) {
              router.replace("/login?reason=session");
            }
            return;
          }
        } else {
          uid = user.id;
          useAppCacheStore.getState().setUserId(uid);
          writeCachedSessionUserId(uid);
        }
      }

      if (isStale()) return;
      setUserId(uid);

      try {
        const hydrate = hydrateRef.current;
        if (hydrate) {
          await Promise.resolve(hydrate(uid));
        }
      } catch {
        devPageLog(page, "cache hydrate error");
      }

      const fresh = !force && useAppCacheStore.getState().isFresh(page, STALE_MS);
      if (fresh) {
        devPageLog(page, "skip fetch (fresh)");
        if (!isStale()) {
          setLoadError(null);
          release();
        }
        return;
      }

      if (!isStale()) setIsRefreshing(true);

      try {
        await fetchRef.current(uid);
        if (isStale()) return;
        useAppCacheStore.getState().markFetched(page);
        devPageLog(page, "fetch success");
        setLoadError(null);
      } catch (e) {
        if (isStale()) return;
        const msg = e instanceof Error ? e.message : "Errore durante il caricamento";
        devPageLog(page, "fetch error", msg);
        setLoadError(msg);
      } finally {
        if (!isStale()) {
          setIsRefreshing(false);
          release();
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      window.clearTimeout(releaseTimer);
    };
  }, [attempt, force, page, router, supabase]);

  const retry = useCallback(() => {
    devPageLog(page, "retry");
    useAppCacheStore.getState().markStale(page);
    setAttempt((a) => a + 1);
  }, [page]);

  const clearError = useCallback(() => setLoadError(null), []);

  return {
    ready,
    userId,
    loadError,
    isRefreshing,
    initialFetchComplete,
    retry,
    clearError,
  };
}
