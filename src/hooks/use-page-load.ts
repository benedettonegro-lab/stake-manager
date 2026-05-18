"use client";

import { devPageLog } from "@/lib/dev-log";
import { resolveAppSession } from "@/lib/resolve-session";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const HARD_LOAD_TIMEOUT_MS = 4_000;
const CACHE_SKELETON_MAX_MS = 1_800;

export type UsePageLoadResult = {
  /** false = mostra skeleton */
  ready: boolean;
  userId: string | null;
  loadError: string | null;
  /** true dopo il primo fetch rete (abilita realtime) */
  initialFetchComplete: boolean;
  retry: () => void;
  clearError: () => void;
};

type UsePageLoadOptions = {
  page: string;
  /** Fetch rete obbligatorio — errori non devono bloccare `ready`. */
  fetch: (userId: string) => Promise<void>;
  /** true se dati cache applicati (skeleton max ~1.8s) */
  hydrateFromCache?: (userId: string) => Promise<boolean> | boolean;
};

export function usePageLoad({
  page,
  fetch,
  hydrateFromCache,
}: UsePageLoadOptions): UsePageLoadResult {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const fetchRef = useRef(fetch);
  const hydrateRef = useRef(hydrateFromCache);

  useEffect(() => {
    fetchRef.current = fetch;
    hydrateRef.current = hydrateFromCache;
  });

  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialFetchComplete, setInitialFetchComplete] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const runIdRef = useRef(0);

  const finish = useCallback((opts?: { error?: string | null }) => {
    if (opts?.error !== undefined) setLoadError(opts.error);
    setReady(true);
    setInitialFetchComplete(true);
  }, []);

  useEffect(() => {
    const runId = ++runIdRef.current;
    let cancelled = false;
    let cacheTimer: ReturnType<typeof setTimeout> | undefined;

    const isStale = () => cancelled || runIdRef.current !== runId;

    queueMicrotask(() => {
      if (isStale()) return;
      setReady(false);
      setInitialFetchComplete(false);
      setLoadError(null);
    });

    devPageLog(page, "fetch start");

    const hardTimer = setTimeout(() => {
      if (isStale()) return;
      devPageLog(page, "loading timeout");
      setLoadError((prev) =>
        prev ?? "Caricamento troppo lento. Controlla la connessione e riprova.",
      );
      finish();
    }, HARD_LOAD_TIMEOUT_MS);

    void (async () => {
      try {
        const { user, error: sessionError } = await resolveAppSession(supabase);
        if (isStale()) return;

        if (!user) {
          devPageLog(page, "session missing", sessionError);
          router.replace("/login?reason=session");
          finish();
          return;
        }

        devPageLog(page, "session found", user.id);
        setUserId(user.id);

        let hadCache = false;
        try {
          const hydrate = hydrateRef.current;
          if (hydrate) {
            const result = await Promise.resolve(hydrate(user.id));
            hadCache = Boolean(result);
            if (hadCache && !isStale()) {
              devPageLog(page, "cache hydrated");
              cacheTimer = setTimeout(() => {
                if (!isStale()) setReady(true);
              }, CACHE_SKELETON_MAX_MS);
            }
          }
        } catch {
          devPageLog(page, "cache hydrate error");
        }

        try {
          await fetchRef.current(user.id);
          if (isStale()) return;
          devPageLog(page, "fetch success");
          setLoadError(null);
        } catch (e) {
          if (isStale()) return;
          const msg =
            e instanceof Error ? e.message : "Errore durante il caricamento";
          devPageLog(page, "fetch error", msg);
          setLoadError(msg);
        }
      } catch (e) {
        if (isStale()) return;
        const msg = e instanceof Error ? e.message : "Errore imprevisto";
        devPageLog(page, "fetch error", msg);
        setLoadError(msg);
      } finally {
        if (isStale()) return;
        if (cacheTimer) clearTimeout(cacheTimer);
        if (hardTimer) clearTimeout(hardTimer);
        finish();
      }
    })();

    return () => {
      cancelled = true;
      if (cacheTimer) clearTimeout(cacheTimer);
      if (hardTimer) clearTimeout(hardTimer);
    };
  }, [attempt, finish, page, router, supabase]);

  const retry = useCallback(() => {
    devPageLog(page, "retry");
    setAttempt((a) => a + 1);
  }, [page]);

  const clearError = useCallback(() => setLoadError(null), []);

  return {
    ready,
    userId,
    loadError,
    initialFetchComplete,
    retry,
    clearError,
  };
}
