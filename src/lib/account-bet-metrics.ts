export type BetAccountRow = {
  gaming_account_id: string;
  profit: string;
  stake: string;
};

export type AccountBetAgg = {
  totalProfit: number;
  totalStake: number;
};

export function aggregateBetsByGamingAccount(
  bets: BetAccountRow[],
): Map<string, AccountBetAgg> {
  const m = new Map<string, AccountBetAgg>();
  for (const b of bets) {
    const id = b.gaming_account_id;
    const prev = m.get(id) ?? { totalProfit: 0, totalStake: 0 };
    prev.totalProfit += Number.parseFloat(b.profit) || 0;
    prev.totalStake += Number.parseFloat(b.stake) || 0;
    m.set(id, prev);
  }
  return m;
}

/** ROI conto = profitto totale scommesse ÷ stake totale (×100). */
export function formatAccountRoi(profit: number, stake: number): string {
  if (stake <= 0 || Number.isNaN(stake)) return "—";
  const roi = (profit / stake) * 100;
  const rounded = Math.round(roi * 100) / 100;
  return `${rounded >= 0 ? "+" : ""}${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(rounded)}%`;
}
