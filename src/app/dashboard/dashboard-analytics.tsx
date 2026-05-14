"use client";

import { AppCard, QuickActionButton, StatPill } from "@/components/app";
import { betIsSettled, betSettledPnL } from "@/lib/bet-balance-effect";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type AccountRow = {
  id: string;
  current_balance: string;
  account_name: string;
  bookmaker: string;
  bookmaker_id: string | null;
  bookmakers: { name: string } | { name: string }[] | null;
};

type PaymentMethodRow = {
  id: string;
  balance: string;
};

type BetAggRow = {
  id: string;
  placed_at: string;
  profit: string;
  stake: string;
  odds: string | number | null;
  player_id: string;
  gaming_account_id: string;
  event_name: string | null;
  status: string | null;
};

type PlayerRow = { id: string; name: string };

function formatMoney(n: number): string {
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatRoi(totalProfit: number, totalStake: number): string {
  if (totalStake <= 0 || Number.isNaN(totalStake)) {
    return Math.abs(totalProfit) < 1e-9 ? "0,0%" : "—";
  }
  const roi = (totalProfit / totalStake) * 100;
  const rounded = Math.round(roi * 100) / 100;
  return `${rounded >= 0 ? "+" : ""}${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(rounded)}%`;
}

function sumBalances(accounts: AccountRow[]): number {
  return accounts.reduce(
    (s, a) => s + (Number.parseFloat(a.current_balance) || 0),
    0,
  );
}

function sumPaymentMethodBalances(rows: PaymentMethodRow[]): number {
  return rows.reduce(
    (s, pm) => s + (Number.parseFloat(pm.balance) || 0),
    0,
  );
}

function aggregateByKey(
  bets: BetAggRow[],
  key: "player_id" | "gaming_account_id",
): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bets) {
    const id = b[key];
    const p = betSettledPnL(
      b.status ?? "open",
      b.stake,
      b.odds ?? 0,
      b.profit,
    );
    m.set(id, (m.get(id) ?? 0) + p);
  }
  return m;
}

function topEntry(
  sums: Map<string, number>,
  names: Map<string, string>,
): { id: string; name: string; profit: number } | null {
  let bestId: string | null = null;
  let best = -Infinity;
  for (const [id, v] of sums) {
    if (v > best) {
      best = v;
      bestId = id;
    }
  }
  if (bestId === null || best === -Infinity) return null;
  return {
    id: bestId,
    name: names.get(bestId) ?? "—",
    profit: best,
  };
}

export function DashboardAnalytics() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [bets, setBets] = useState<BetAggRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [aRes, pmRes, bRes, pRes] = await Promise.all([
      supabase
        .from("gaming_accounts")
        .select(
          `
          id,
          current_balance,
          account_name,
          bookmaker,
          bookmaker_id,
          bookmakers ( name )
        `,
        ),
      supabase.from("payment_methods").select("id, balance"),
      supabase
        .from("bets")
        .select(
          "id, placed_at, profit, stake, odds, player_id, gaming_account_id, event_name, status",
        )
        .order("placed_at", { ascending: false }),
      supabase.from("players").select("id, name"),
    ]);

    if (aRes.error || pmRes.error || bRes.error || pRes.error) {
      setError(
        aRes.error?.message ??
          pmRes.error?.message ??
          bRes.error?.message ??
          pRes.error?.message ??
          "Errore caricamento",
      );
      return;
    }
    setAccounts((aRes.data as AccountRow[]) ?? []);
    setPaymentMethods((pmRes.data as PaymentMethodRow[]) ?? []);
    setBets((bRes.data as BetAggRow[]) ?? []);
    setPlayers((pRes.data as PlayerRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {});

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        return;
      }
      await load();
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [load, router, supabase]);

  const totals = useMemo(() => {
    const saldoConti = sumBalances(accounts);
    const saldoMetodi = sumPaymentMethodBalances(paymentMethods);
    const saldoCassaTotale = saldoConti + saldoMetodi;

    let totalProfit = 0;
    let totalStake = 0;
    for (const b of bets) {
      totalProfit += betSettledPnL(
        b.status ?? "open",
        b.stake,
        b.odds ?? 0,
        b.profit,
      );
      if (betIsSettled(b.status ?? "open")) {
        totalStake += Number.parseFloat(b.stake) || 0;
      }
    }

    return {
      saldoConti,
      saldoMetodi,
      saldoCassaTotale,
      totalProfit,
      totalStake,
      betCount: bets.length,
      roiLabel: formatRoi(totalProfit, totalStake),
    };
  }, [accounts, bets, paymentMethods]);

  const breakdown = useMemo(() => {
    const playerSums = aggregateByKey(bets, "player_id");
    const accountSums = aggregateByKey(bets, "gaming_account_id");
    const playerNames = new Map(players.map((p) => [p.id, p.name] as const));
    const accountNames = new Map(
      accounts.map((a) => {
        const bm = gamingAccountBookmakerDisplay(a);
        return [a.id, `${a.account_name}${bm ? ` · ${bm}` : ""}`] as const;
      }),
    );
    const topPlayer = topEntry(playerSums, playerNames);
    const topAccount = topEntry(accountSums, accountNames);
    return { topPlayer, topAccount };
  }, [accounts, bets, players]);

  const recentEvents = useMemo(() => bets.slice(0, 5), [bets]);

  const cassaTone =
    totals.saldoCassaTotale > 0
      ? "text-[#34d399]"
      : totals.saldoCassaTotale < 0
        ? "text-red-400"
        : "text-white";

  const roiTone: "default" | "positive" | "negative" =
    totals.totalStake <= 0
      ? "default"
      : totals.totalProfit > 0
        ? "positive"
        : totals.totalProfit < 0
          ? "negative"
          : "default";

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 py-12 text-lg sm:text-base text-[#8B93A7] sm:text-sm">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-white/[0.12] border-t-[#A970FF]/45"
          aria-hidden
        />
        <p>Caricamento panoramica…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 pb-2 sm:gap-4 sm:pb-2">
      {error ? (
        <p
          className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-[14px] text-[#fb7185] sm:text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section aria-label="Cassa totale">
        <div className="sm-gradient-border">
          <div className="sm-gradient-inner px-2.5 py-2 sm:p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:text-xs sm:tracking-widest">
              Cassa totale
            </p>
            <p
              className={`mt-1.5 whitespace-nowrap text-xl font-bold tabular-nums leading-none tracking-tight sm:mt-2 sm:text-2xl sm:font-bold ${cassaTone}`}
            >
              {formatMoney(totals.saldoCassaTotale)} €
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Indicatori" className="grid grid-cols-2 gap-1.5 sm:gap-2">
        <StatPill label="Conti gioco" value={`${formatMoney(totals.saldoConti)} €`} />
        <StatPill label="Metodi" value={`${formatMoney(totals.saldoMetodi)} €`} />
        <StatPill
          label="Profit"
          value={`${totals.totalProfit >= 0 ? "+" : ""}${formatMoney(totals.totalProfit)} €`}
          tone={totals.totalProfit > 0 ? "positive" : totals.totalProfit < 0 ? "negative" : "default"}
        />
        <StatPill label="ROI" value={totals.roiLabel} tone={roiTone} />
      </section>

      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        <QuickActionButton href="/bets?nuova=1" variant="primary">
          + Giocata
        </QuickActionButton>
        <QuickActionButton href="/movimenti" variant="ghost">
          Movimenti
        </QuickActionButton>
      </div>

      <section aria-labelledby="dash-recent-heading">
        <div className="mb-1.5 flex items-center justify-between gap-2 sm:mb-2">
          <h2
            id="dash-recent-heading"
            className="text-xl font-bold uppercase leading-tight tracking-wide text-[#8B93A7] sm:text-2xl sm:font-semibold sm:tracking-widest"
          >
            Ultimi eventi
          </h2>
          <Link
            href="/bets"
            className="text-sm font-semibold text-[#A970FF] transition hover:text-[#B89EFF] sm:text-sm"
          >
            Tutte
          </Link>
        </div>
        <ul className="flex flex-col gap-1.5 sm:gap-2">
          {recentEvents.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-white/[0.06] px-2.5 py-4 text-center text-xs text-[#8B93A7] sm:rounded-xl sm:px-3 sm:py-6 sm:text-sm">
              Nessuna giocata
            </li>
          ) : (
            recentEvents.map((b) => {
              const p = betSettledPnL(
                b.status ?? "open",
                b.stake,
                b.odds ?? 0,
                b.profit,
              );
              const acc = accounts.find((x) => x.id === b.gaming_account_id);
              const sub = acc
                ? `${acc.account_name}${gamingAccountBookmakerDisplay(acc) ? ` · ${gamingAccountBookmakerDisplay(acc)}` : ""}`
                : "Conto";
              return (
                <li key={b.id}>
                  <AppCard href={`/bets#${b.id}`} padding="sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[15px] font-bold leading-snug text-[#E6EAF2] sm:text-xl sm:font-semibold">
                          {b.event_name?.trim() || "Giocata"}
                        </p>
                        <p className="mt-1 truncate text-xs leading-snug text-[#8B93A7] sm:mt-1 sm:text-sm sm:leading-normal">{sub}</p>
                      </div>
                      <span
                        className={`shrink-0 whitespace-nowrap text-lg font-bold tabular-nums sm:text-2xl sm:font-bold ${
                          p > 0 ? "text-[#34d399]" : p < 0 ? "text-[#fb7185]" : "text-[#8B93A7]"
                        }`}
                      >
                        {p > 0 ? "+" : ""}
                        {formatMoney(p)} €
                      </span>
                    </div>
                    <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6B7385] sm:mt-2 sm:text-xs sm:font-medium sm:tracking-wide">
                      {new Intl.DateTimeFormat("it-IT", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(b.placed_at))}{" "}
                      · {b.status ?? "—"}
                    </p>
                  </AppCard>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <section className="grid grid-cols-2 gap-1.5 sm:gap-2" aria-label="Best">
        {breakdown.topPlayer ? (
          <AppCard href={`/players/${breakdown.topPlayer.id}`} padding="sm">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8B93A7] sm:text-xs sm:tracking-wide">
              Top ID
            </p>
            <p className="mt-1.5 truncate text-[15px] font-bold leading-snug text-[#E6EAF2] sm:mt-1 sm:text-xl sm:font-semibold">
              {breakdown.topPlayer.name}
            </p>
            <p
              className={`mt-1.5 whitespace-nowrap text-base font-bold tabular-nums sm:mt-1 sm:text-xl sm:font-bold ${
                breakdown.topPlayer.profit >= 0 ? "text-[#34d399]" : "text-[#fb7185]"
              }`}
            >
              {breakdown.topPlayer.profit >= 0 ? "+" : ""}
              {formatMoney(breakdown.topPlayer.profit)} €
            </p>
          </AppCard>
        ) : (
          <AppCard padding="sm">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8B93A7] sm:text-xs sm:tracking-wide">
              Top ID
            </p>
            <p className="mt-2 text-[14px] text-[#8B93A7] sm:mt-1 sm:text-sm">—</p>
          </AppCard>
        )}
        {breakdown.topAccount ? (
          <AppCard href={`/accounts/${breakdown.topAccount.id}`} padding="sm">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8B93A7] sm:text-xs sm:tracking-wide">
              Top conto
            </p>
            <p className="mt-1.5 line-clamp-2 text-[15px] font-bold leading-snug text-[#E6EAF2] sm:mt-1 sm:text-xl sm:font-semibold">
              {breakdown.topAccount.name}
            </p>
            <p
              className={`mt-1.5 whitespace-nowrap text-base font-bold tabular-nums sm:mt-1 sm:text-xl sm:font-bold ${
                breakdown.topAccount.profit >= 0 ? "text-[#34d399]" : "text-[#fb7185]"
              }`}
            >
              {breakdown.topAccount.profit >= 0 ? "+" : ""}
              {formatMoney(breakdown.topAccount.profit)} €
            </p>
          </AppCard>
        ) : (
          <AppCard padding="sm">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8B93A7] sm:text-xs sm:tracking-wide">
              Top conto
            </p>
            <p className="mt-2 text-[14px] text-[#8B93A7] sm:mt-1 sm:text-sm">—</p>
          </AppCard>
        )}
      </section>
    </div>
  );
}
