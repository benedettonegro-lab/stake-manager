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

/** True se la giocata è refertata (entra in profit / ROI / timeline P&L). */
export function betIsSettled(status: string): boolean {
  return status !== "open";
}

/**
 * P&L mostrato in metriche (profit, ROI, timeline): **solo refertate**; le aperte = 0.
 * - open → 0
 * - lost → −stake
 * - won → stake×quota − stake (vincita netta)
 * - void → 0
 * - cashout → campo `profit` registrato
 */
export function betSettledPnL(
  status: BetStatusForBalance | string,
  stake: number | string,
  odds: number | string,
  profit: number | string,
): number {
  if (status === "open") return 0;
  const S = parseNum(stake);
  const O = parseNum(odds);
  const P = parseNum(profit);
  switch (status) {
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

/**
 * Contributo sul **saldo disponibile** conto/staker (trigger DB): include stake trattenuto sulle aperte.
 * - open / lost: −stake
 * - won: stake×quota − stake
 * - void: 0 (stake restituito al referto)
 * - cashout: profit registrato
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

/** Delta sul saldo conto/staker quando si passa da uno stato riga a un altro (coerente con trigger DB). */
export function betBalanceContributionDelta(
  before: {
    status: string;
    stake: number | string;
    odds: number | string;
    profit: number | string;
  },
  after: {
    status: string;
    stake: number | string;
    odds: number | string;
    profit: number | string;
  },
): number {
  return round4(
    betBalanceContribution(after.status, after.stake, after.odds, after.profit) -
      betBalanceContribution(before.status, before.stake, before.odds, before.profit),
  );
}
