"use client";

import { devPageLog } from "@/lib/dev-log";
import { resolveAppSession } from "@/lib/resolve-session";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAppCacheStore } from "@/stores/app-cache-store";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const STALE_MS = 45_000;

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
  const [userId, setUserId] = useState<string | null>(() => useAppCacheStore.getState().userId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialFetchComplete, setInitialFetchComplete] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const runIdRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    const runId = ++runIdRef.current;
    let cancelled = false;
    const isStale = () => cancelled || runIdRef.current !== runId;

    const run = async () => {
      if (!mountedRef.current) {
        mountedRef.current = true;
      }

      devPageLog(page, "instant load start");

      let uid = useAppCacheStore.getState().userId;

      if (!uid) {
        const { user, error: sessionError } = await resolveAppSession(supabase);
        if (isStale()) return;
        if (!user) {
          devPageLog(page, "session missing", sessionError);
          router.replace("/login?reason=session");
          setInitialFetchComplete(true);
          return;
        }
        uid = user.id;
        useAppCacheStore.getState().setUserId(uid);
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
          setInitialFetchComplete(true);
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
          setInitialFetchComplete(true);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
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
