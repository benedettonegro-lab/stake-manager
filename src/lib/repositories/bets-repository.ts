import type { SupabaseClient } from "@supabase/supabase-js";
import { betSettledPnL } from "@/lib/bet-balance-effect";
import { formatClientError } from "@/lib/user-message";

export type BetStatus = "open" | "won" | "lost" | "void" | "cashout";

export type BetListRow = {
  id: string;
  player_id: string;
  staker_id: string;
  gaming_account_id: string;
  event_name: string;
  odds: string;
  stake: string;
  status: BetStatus;
  profit: string;
  placed_at: string;
  settled_at: string | null;
  bet_type?: string | null;
  note?: string | null;
  gaming_accounts: {
    account_name: string;
    bookmaker: string;
    bookmaker_id?: string | null;
    bookmakers?: { name: string } | null;
  } | null;
  stakers: { name: string } | null;
};

const BET_LIST_SELECT = `
  id,
  player_id,
  staker_id,
  gaming_account_id,
  event_name,
  odds,
  stake,
  status,
  profit,
  placed_at,
  settled_at,
  bet_type,
  note,
  gaming_accounts ( account_name, bookmaker, bookmaker_id, bookmakers ( name ) ),
  stakers ( name )
`;

export type BetsSettledStats = {
  total_bets: number;
  settled_stake: number;
  settled_pnl: number;
};

function parseRollupRow(raw: unknown): BetsSettledStats | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const total = Number(o.total_bets);
  const stake = Number.parseFloat(String(o.settled_stake ?? 0).replace(",", "."));
  const pnl = Number.parseFloat(String(o.settled_pnl ?? 0).replace(",", "."));
  if (!Number.isFinite(total) || !Number.isFinite(stake) || !Number.isFinite(pnl)) return null;
  return {
    total_bets: Math.max(0, Math.floor(total)),
    settled_stake: Math.round(stake * 1e4) / 1e4,
    settled_pnl: Math.round(pnl * 1e4) / 1e4,
  };
}

export async function fetchUserBetsSettledStats(
  supabase: SupabaseClient,
): Promise<{ ok: true; stats: BetsSettledStats } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("user_bets_settled_stats");
  if (error) {
    return { ok: false, message: formatClientError(error) };
  }
  const stats = parseRollupRow(data);
  if (!stats) {
    return { ok: false, message: "Dati riepilogo non disponibili." };
  }
  return { ok: true, stats };
}

/** RPC sul DB se disponibile; altrimenti fallback (meno efficiente su molte righe). */
export async function fetchUserBetsSettledStatsWithFallback(
  supabase: SupabaseClient,
): Promise<{ ok: true; stats: BetsSettledStats } | { ok: false; message: string }> {
  const primary = await fetchUserBetsSettledStats(supabase);
  if (primary.ok) return primary;
  return fetchUserBetsSettledStatsFallback(supabase);
}

/** Fallback se la RPC non è ancora deployata sul progetto Supabase. */
export async function fetchUserBetsSettledStatsFallback(
  supabase: SupabaseClient,
): Promise<{ ok: true; stats: BetsSettledStats } | { ok: false; message: string }> {
  const { data, error } = await supabase.from("bets").select("stake, profit, status, odds");
  if (error) {
    return { ok: false, message: formatClientError(error) };
  }
  const rows = (data ?? []) as {
    stake: string;
    profit: string;
    status: string;
    odds: string | number;
  }[];
  let settledStake = 0;
  let settledPnl = 0;
  for (const r of rows) {
    settledPnl += betSettledPnL(r.status, r.stake, r.odds, r.profit);
    if (r.status !== "open") {
      settledStake += Number.parseFloat(String(r.stake).replace(",", ".")) || 0;
    }
  }
  return {
    ok: true,
    stats: {
      total_bets: rows.length,
      settled_stake: Math.round(settledStake * 1e4) / 1e4,
      settled_pnl: Math.round(settledPnl * 1e4) / 1e4,
    },
  };
}

export async function fetchBetsPage(
  supabase: SupabaseClient,
  opts: { limit: number; offset: number },
): Promise<{ ok: true; rows: BetListRow[] } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from("bets")
    .select(BET_LIST_SELECT)
    .order("placed_at", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);

  if (error) {
    return { ok: false, message: formatClientError(error) };
  }
  return { ok: true, rows: (data as unknown as BetListRow[]) ?? [] };
}

export async function insertBet(
  supabase: SupabaseClient,
  row: {
    user_id: string;
    gaming_account_id: string;
    player_id: string;
    staker_id: string;
    event_name: string;
    odds: number;
    stake: number;
    status: BetStatus;
    profit: number;
    bet_type: string;
  },
): Promise<{ ok: true; bet: BetListRow } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from("bets")
    .insert(row)
    .select(BET_LIST_SELECT)
    .single();

  if (error || !data) {
    return { ok: false, message: formatClientError(error) };
  }
  return { ok: true, bet: data as unknown as BetListRow };
}

export async function updateBetById(
  supabase: SupabaseClient,
  betId: string,
  patch: {
    gaming_account_id: string;
    staker_id: string;
    player_id: string;
    event_name: string;
    odds: number;
    stake: number;
    status: BetStatus;
    bet_type: string;
    profit: number;
    settled_at: string | null;
    note: string | null;
  },
): Promise<{ ok: true; bet: BetListRow } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from("bets")
    .update(patch)
    .eq("id", betId)
    .select(BET_LIST_SELECT)
    .single();

  if (error || !data) {
    return { ok: false, message: formatClientError(error) };
  }
  return { ok: true, bet: data as unknown as BetListRow };
}

export async function updateBetStatusOnly(
  supabase: SupabaseClient,
  betId: string,
  patch: { status: BetStatus; profit: number; settled_at: string | null },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from("bets").update(patch).eq("id", betId);
  if (error) {
    return { ok: false, message: formatClientError(error) };
  }
  return { ok: true };
}

export async function deleteBetById(
  supabase: SupabaseClient,
  betId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from("bets").delete().eq("id", betId);
  if (error) {
    return { ok: false, message: formatClientError(error) };
  }
  return { ok: true };
}

export async function betExists(
  supabase: SupabaseClient,
  betId: string,
): Promise<{ ok: true; exists: boolean } | { ok: false; message: string }> {
  const { data, error } = await supabase.from("bets").select("id").eq("id", betId).maybeSingle();
  if (error) {
    return { ok: false, message: formatClientError(error) };
  }
  return { ok: true, exists: Boolean(data) };
}

export async function fetchGamingAccountBalances(
  supabase: SupabaseClient,
): Promise<
  { ok: true; rows: { id: string; current_balance: string }[] } | { ok: false; message: string }
> {
  const { data, error } = await supabase
    .from("gaming_accounts")
    .select("id, current_balance")
    .order("account_name");
  if (error) {
    return { ok: false, message: formatClientError(error) };
  }
  return { ok: true, rows: (data as { id: string; current_balance: string }[]) ?? [] };
}
