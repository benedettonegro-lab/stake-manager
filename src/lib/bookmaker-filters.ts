/**
 * Bookmaker sui conti: `bookmaker_id` + join `bookmakers`, oppure solo `bookmaker` testuale (legacy).
 * Per filtri futuri: `filterGamingAccountsByBookmakerId`, `gamingAccountIdsForBookmaker` + `filterBetsByBookmakerId`.
 */
/** Riga conto con FK opzionale e/o nome legacy + join Supabase */
export type GamingAccountBookmakerFields = {
  id: string;
  bookmaker_id?: string | null;
  bookmaker?: string | null;
  /** PostgREST può restituire oggetto o array per FK. */
  bookmakers?: { name: string } | { name: string }[] | null;
};

function joinedBookmakerName(
  bookmakers: GamingAccountBookmakerFields["bookmakers"],
): string {
  if (bookmakers == null) return "";
  if (Array.isArray(bookmakers)) {
    return (bookmakers[0]?.name ?? "").trim();
  }
  return (bookmakers.name ?? "").trim();
}

/** Nome bookmaker da mostrare: join, altrimenti campo testuale legacy. */
export function gamingAccountBookmakerDisplay(
  row: Pick<GamingAccountBookmakerFields, "bookmaker_id" | "bookmaker" | "bookmakers">,
): string {
  const joined = joinedBookmakerName(row.bookmakers);
  if (joined) return joined;
  return (row.bookmaker ?? "").trim();
}

export function filterGamingAccountsByBookmakerId<T extends { bookmaker_id?: string | null }>(
  rows: T[],
  bookmakerId: string | null | undefined,
): T[] {
  if (bookmakerId == null || bookmakerId === "") return rows;
  return rows.filter((r) => r.bookmaker_id === bookmakerId);
}

/** ID conti che hanno il bookmaker indicato (solo FK; conti solo-legacy testuale non entrano nel filtro). */
export function gamingAccountIdsForBookmaker(
  accounts: { id: string; bookmaker_id?: string | null }[],
  bookmakerId: string,
): Set<string> {
  return new Set(
    accounts.filter((a) => a.bookmaker_id === bookmakerId).map((a) => a.id),
  );
}

export function filterBetsByBookmakerId<T extends { gaming_account_id: string }>(
  bets: T[],
  gamingAccountIds: Set<string>,
): T[] {
  if (gamingAccountIds.size === 0) return [];
  return bets.filter((b) => gamingAccountIds.has(b.gaming_account_id));
}
