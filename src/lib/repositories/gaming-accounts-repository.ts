import type { SupabaseClient } from "@supabase/supabase-js";
import { formatClientError } from "@/lib/user-message";

const ACCOUNT_LIST_SELECT = `
  id,
  account_name,
  bookmaker,
  bookmaker_id,
  current_balance,
  initial_balance,
  player_id,
  identity_id,
  account_status,
  note,
  bookmakers ( name )
`;

export type GamingAccountListRow = {
  id: string;
  player_id: string;
  identity_id: string;
  account_name: string;
  bookmaker: string;
  bookmaker_id: string | null;
  bookmakers: { name: string } | { name: string }[] | null;
  note: string | null;
  initial_balance: string;
  current_balance: string;
  account_status: string | null;
};

export type AccountsPageCursor = { account_name: string; id: string };

function buildAccountsKeysetFilter(cursor: AccountsPageCursor): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const n = esc(cursor.account_name);
  const i = esc(cursor.id);
  return `account_name.gt."${n}",and(account_name.eq."${n}",id.gt."${i}")`;
}

export async function fetchGamingAccountsPage(
  supabase: SupabaseClient,
  opts: { limit: number; cursor: AccountsPageCursor | null },
): Promise<
  { ok: true; rows: GamingAccountListRow[] } | { ok: false; message: string }
> {
  let q = supabase.from("gaming_accounts").select(ACCOUNT_LIST_SELECT);
  if (opts.cursor) {
    q = q.or(buildAccountsKeysetFilter(opts.cursor));
  }
  const { data, error } = await q
    .order("account_name", { ascending: true })
    .order("id", { ascending: true })
    .limit(opts.limit);

  if (error) {
    return { ok: false, message: formatClientError(error) };
  }
  return { ok: true, rows: (data as unknown as GamingAccountListRow[]) ?? [] };
}

/** Solo saldi — payload leggero per refresh frequenti / realtime. */
export async function fetchGamingAccountBalanceMap(
  supabase: SupabaseClient,
): Promise<
  | { ok: true; map: Map<string, string> }
  | { ok: false; message: string }
> {
  const { data, error } = await supabase
    .from("gaming_accounts")
    .select("id, current_balance");

  if (error) {
    return { ok: false, message: formatClientError(error) };
  }
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.id as string, String(row.current_balance));
  }
  return { ok: true, map };
}
