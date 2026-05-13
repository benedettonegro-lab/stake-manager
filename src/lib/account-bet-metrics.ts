import { betBalanceContribution } from "@/lib/bet-balance-effect";

export type BetAccountRow = {
  gaming_account_id: string;
  profit: string;
  stake: string;
  status: string;
  odds: string | number;
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
    prev.totalProfit += betBalanceContribution(
      b.status,
      b.stake,
      b.odds,
      b.profit,
    );
    prev.totalStake += Number.parseFloat(b.stake) || 0;
    m.set(id, prev);
  }
  return m;
}

/** ROI conto = effetto netto sul saldo (stake riservato / vincite / cashout) ÷ stake totale (×100). */
export function formatAccountRoi(profit: number, stake: number): string {
  if (stake <= 0 || Number.isNaN(stake)) return "—";
  const roi = (profit / stake) * 100;
  const rounded = Math.round(roi * 100) / 100;
  return `${rounded >= 0 ? "+" : ""}${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(rounded)}%`;
}
