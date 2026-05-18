import type { BetListRow } from "@/lib/repositories/bets-repository";
import { betSettledPnL } from "@/lib/bet-balance-effect";

export type BetTimelineRow =
  | { kind: "month"; key: string; title: string; profitTotal: number }
  | { kind: "day"; key: string; title: string; profitTotal: number }
  | { kind: "bet"; key: string; bet: BetListRow };

const MONTH_HEADER = 52;
const DAY_HEADER = 40;
export const BET_CARD_HEIGHT = 132;

export function estimateTimelineRowHeight(row: BetTimelineRow): number {
  if (row.kind === "month") return MONTH_HEADER;
  if (row.kind === "day") return DAY_HEADER;
  return BET_CARD_HEIGHT;
}

function capitalizeIt(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthTitleFromKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const raw = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
  }).format(d);
  return capitalizeIt(raw);
}

function dayTitleCompact(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

/** Appiattisce gruppi mese/giorno in righe virtualizzabili. */
export function flattenBetTimeline(bets: BetListRow[]): BetTimelineRow[] {
  type Bucket = {
    profitTotal: number;
    days: Map<string, { bets: BetListRow[]; sample: Date }>;
  };
  const months = new Map<string, Bucket>();

  for (const b of bets) {
    const d = new Date(b.placed_at);
    const y = d.getFullYear();
    const mo = d.getMonth();
    const day = d.getDate();
    const monthKey = `${y}-${String(mo + 1).padStart(2, "0")}`;
    const dayKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    const p = betSettledPnL(b.status, b.stake, b.odds, b.profit);

    if (!months.has(monthKey)) {
      months.set(monthKey, { profitTotal: 0, days: new Map() });
    }
    const bucket = months.get(monthKey)!;
    bucket.profitTotal += p;
    if (!bucket.days.has(dayKey)) {
      bucket.days.set(dayKey, { bets: [], sample: d });
    }
    bucket.days.get(dayKey)!.bets.push(b);
  }

  const monthKeys = [...months.keys()].sort((a, b) => b.localeCompare(a));
  const out: BetTimelineRow[] = [];

  for (const mk of monthKeys) {
    const bucket = months.get(mk)!;
    out.push({
      kind: "month",
      key: `m-${mk}`,
      title: monthTitleFromKey(mk),
      profitTotal: bucket.profitTotal,
    });

    const dayKeys = [...bucket.days.keys()].sort((a, b) => b.localeCompare(a));
    for (const dk of dayKeys) {
      const { bets: dayBets, sample } = bucket.days.get(dk)!;
      const profitTotal = dayBets.reduce(
        (s, x) => s + betSettledPnL(x.status, x.stake, x.odds, x.profit),
        0,
      );
      out.push({
        kind: "day",
        key: `d-${dk}`,
        title: dayTitleCompact(sample),
        profitTotal,
      });
      for (const bet of dayBets) {
        out.push({ kind: "bet", key: bet.id, bet });
      }
    }
  }

  return out;
}

/** Altezze cumulative per scroll virtuale a altezza variabile. */
export function buildTimelineOffsets(rows: BetTimelineRow[]): {
  offsets: number[];
  totalHeight: number;
} {
  const offsets: number[] = [0];
  let h = 0;
  for (const row of rows) {
    h += estimateTimelineRowHeight(row);
    offsets.push(h);
  }
  return { offsets, totalHeight: h };
}

export function findTimelineStartIndex(offsets: number[], scrollTop: number): number {
  let lo = 0;
  let hi = offsets.length - 2;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (offsets[mid] <= scrollTop) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
