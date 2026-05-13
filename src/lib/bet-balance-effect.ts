export type BetStatusForBalance =
  | "open"
  | "won"
  | "lost"
  | "void"
  | "cashout";

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function parseNum(v: unknown): number {
  const n = Number.parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Contributo netto di una giocata sul saldo conto/staker rispetto a «nessuna giocata»:
 * - open / lost: −stake (stake già impegnato o perso, nessun ulteriore movimento al passaggio open→lost)
 * - won: stake×quota − stake (equivale a −stake al momento dell’apertura + quota×stake alla vincita)
 * - void: 0
 * - cashout: usa il campo profit (netto registrato)
 */
export function betBalanceContribution(
  status: BetStatusForBalance | string,
  stake: number | string,
  odds: number | string,
  profit: number | string,
): number {
  const S = parseNum(stake);
  const O = parseNum(odds);
  const P = parseNum(profit);
  switch (status) {
    case "open":
    case "lost":
      return round4(-S);
    case "won":
      if (O > 0) return round4(S * O - S);
      return round4(-S);
    case "void":
      return 0;
    case "cashout":
      return round4(P);
    default:
      return 0;
  }
}
