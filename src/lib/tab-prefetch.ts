"use client";

import { dedupeFetch, queryCacheKey } from "@/lib/query-coordinator";
import { fetchBetsPage } from "@/lib/repositories/bets-repository";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { readStaleCache, writeFreshCache } from "@/lib/swr-cache";
import { useAppCacheStore } from "@/stores/app-cache-store";

const BETS_LIST_NS = "bets_list_v1";

/** Prefetch silenzioso per tab bottom-nav (non blocca UI). */
export function prefetchTabRoute(userId: string, pathname: string): void {
  if (!userId) return;
  const store = useAppCacheStore.getState();
  if (pathname.startsWith("/bets") || pathname.startsWith("/giocate")) {
    if (store.isFresh("bets")) return;
    void dedupeFetch(queryCacheKey(["prefetch", "bets", userId]), async () => {
      const supabase = getSupabaseBrowserClient();
      const [refs, betsRes] = await Promise.all([
        readStaleCache<{ stakers: unknown[]; accounts: unknown[] }>(userId, "bet_refs"),
        fetchBetsPage(supabase, { limit: 50, cursor: null }),
      ]);
      if (betsRes.ok) {
        void writeFreshCache(userId, BETS_LIST_NS, {
          rows: betsRes.rows,
          hasMore: betsRes.rows.length === 50,
        });
      }
      void refs;
      store.markFetched("bets");
      return true;
    }).catch(() => undefined);
    return;
  }

  if (pathname.startsWith("/accounts") || pathname.startsWith("/conti")) {
    if (store.isFresh("accounts")) return;
    void dedupeFetch(queryCacheKey(["prefetch", "accounts", userId]), async () => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gaming_accounts")
        .select(
          "id, player_id, identity_id, account_name, bookmaker, bookmaker_id, initial_balance, current_balance, account_status, bookmakers ( name )",
        )
        .order("account_name");
      if (!error && data) void writeFreshCache(userId, "accounts_list_v1", data);
      store.markFetched("accounts");
      return true;
    }).catch(() => undefined);
    return;
  }

  if (pathname.startsWith("/stakers")) {
    if (store.isFresh("stakers")) return;
    void dedupeFetch(queryCacheKey(["prefetch", "stakers", userId]), async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase
        .from("stakers")
        .select("id, name, balance, player_id")
        .order("name");
      if (data) {
        void writeFreshCache(userId, "stakers_list_v1", {
          stakers: Array.isArray(data) ? data : [],
          bets: [],
        });
      }
      store.markFetched("stakers");
      return true;
    }).catch(() => undefined);
  }
}

export function prefetchMainTabs(userId: string): void {
  const routes = [
    "/bets",
    "/accounts",
    "/stakers",
    "/dashboard",
    "/identities",
    "/movimenti",
    "/bookmakers",
  ];
  for (const r of routes) prefetchTabRoute(userId, r);
}
