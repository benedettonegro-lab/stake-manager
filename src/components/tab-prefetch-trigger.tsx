"use client";

import { prefetchTabRoute, prefetchMainTabs } from "@/lib/tab-prefetch";
import { resolveAppSession } from "@/lib/resolve-session";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAppCacheStore } from "@/stores/app-cache-store";
import { useEffect } from "react";

/** Prefetch dati tab dopo login / idle. */
export function TabPrefetchTrigger() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const cached = useAppCacheStore.getState().userId;
      if (cached) {
        prefetchMainTabs(cached);
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const { user } = await resolveAppSession(supabase);
      if (cancelled || !user) return;
      useAppCacheStore.getState().setUserId(user.id);
      prefetchMainTabs(user.id);
    };

    const idle =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback(() => void run())
        : window.setTimeout(() => void run(), 400);

    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback !== "undefined" && typeof idle === "number") {
        cancelIdleCallback(idle);
      } else {
        clearTimeout(idle as number);
      }
    };
  }, []);

  return null;
}

export function prefetchOnNavIntent(userId: string | null, href: string): void {
  if (!userId) return;
  prefetchTabRoute(userId, href);
}
