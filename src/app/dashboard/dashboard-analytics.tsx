"use client";

import { AppCard, QuickActionButton, StatPill } from "@/components/app";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import { createBrowserSupabaseClient } from "@/lib/supabase";
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
  if (totalStake <= 0 || Number.isNaN(totalStake)) return "—";
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
    const p = Number.parseFloat(b.profit) || 0;
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

function toneClass(n: number, neutralZero = true): string {
  if (n > 0) return "text-[#34d399]";
  if (n < 0) return "text-red-400";
  return neutralZero ? "text-[#94a3b8]" : "text-white";
}

export function DashboardAnalytics() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

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
          "id, placed_at, profit, stake, player_id, gaming_account_id, event_name, status",
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
    const { data: authSub } = supabase.auth.onAuthStateChange((ev) => {
      if (ev === "SIGNED_OUT") router.replace("/login");
    });

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
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
      totalProfit += Number.parseFloat(b.profit) || 0;
      totalStake += Number.parseFloat(b.stake) || 0;
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

  const roiClass =
    roiTone === "positive"
      ? "text-[#34d399]"
      : roiTone === "negative"
        ? "text-red-400"
        : "text-[#94a3b8]";

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 py-12 text-sm text-[#94a3b8]">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-[#5b5cff] border-t-transparent"
          aria-hidden
        />
        <p>Caricamento panoramica…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      {error ? (
        <p
          className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-xs text-[#fb7185]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section aria-label="Cassa totale">
        <div className="sm-gradient-border">
          <div className="sm-gradient-inner px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#64748b]">
              Cassa totale
            </p>
            <p
              className={`mt-2 text-3xl font-bold tabular-nums tracking-tight ${cassaTone}`}
            >
              {formatMoney(totals.saldoCassaTotale)} €
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Indicatori" className="grid grid-cols-2 gap-2">
        <StatPill label="Conti gioco" value={`${formatMoney(totals.saldoConti)} €`} />
        <StatPill label="Metodi" value={`${formatMoney(totals.saldoMetodi)} €`} />
        <StatPill
          label="Profit"
          value={`${totals.totalProfit >= 0 ? "+" : ""}${formatMoney(totals.totalProfit)} €`}
          tone={totals.totalProfit > 0 ? "positive" : totals.totalProfit < 0 ? "negative" : "default"}
        />
        <StatPill label="ROI" value={totals.roiLabel} tone={roiTone === "positive" ? "positive" : roiTone === "negative" ? "negative" : "default"} />
      </section>

      <div className="flex flex-wrap gap-2">
        <QuickActionButton href="/bets?nuova=1" variant="primary">
          + Giocata
        </QuickActionButton>
        <QuickActionButton href="/movimenti" variant="ghost">
          Movimenti
        </QuickActionButton>
      </div>

      <section aria-labelledby="dash-recent-heading">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="dash-recent-heading" className="text-[10px] font-semibold uppercase tracking-widest text-[#64748b]">
            Ultimi eventi
          </h2>
          <Link
            href="/bets"
            className="text-[10px] font-semibold text-[#a855f7] transition hover:text-[#c4b5fd]"
          >
            Tutte
          </Link>
        </div>
        <ul className="flex flex-col gap-2">
          {recentEvents.length === 0 ? (
            <li className="rounded-xl border border-dashed border-[#273449] px-3 py-6 text-center text-xs text-[#64748b]">
              Nessuna giocata
            </li>
          ) : (
            recentEvents.map((b) => {
              const p = Number.parseFloat(b.profit) || 0;
              const acc = accounts.find((x) => x.id === b.gaming_account_id);
              const sub = acc
                ? `${acc.account_name}${gamingAccountBookmakerDisplay(acc) ? ` · ${gamingAccountBookmakerDisplay(acc)}` : ""}`
                : "Conto";
              return (
                <li key={b.id}>
                  <AppCard href={`/bets#${b.id}`} padding="sm" className="!rounded-xl">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">
                          {b.event_name?.trim() || "Giocata"}
                        </p>
                        <p className="mt-1 truncate text-[10px] text-[#64748b]">{sub}</p>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-bold tabular-nums ${
                          p > 0 ? "text-[#34d399]" : p < 0 ? "text-[#fb7185]" : "text-[#94a3b8]"
                        }`}
                      >
                        {p > 0 ? "+" : ""}
                        {formatMoney(p)} €
                      </span>
                    </div>
                    <p className="mt-2 text-[9px] font-medium uppercase tracking-wide text-[#475569]">
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

      <section className="grid grid-cols-2 gap-2" aria-label="Best">
        {breakdown.topPlayer ? (
          <AppCard href={`/players/${breakdown.topPlayer.id}`} padding="sm">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[#64748b]">Top ID</p>
            <p className="mt-1 truncate text-sm font-semibold text-white">{breakdown.topPlayer.name}</p>
            <p
              className={`mt-1 text-xs font-bold tabular-nums ${
                breakdown.topPlayer.profit >= 0 ? "text-[#34d399]" : "text-[#fb7185]"
              }`}
            >
              {breakdown.topPlayer.profit >= 0 ? "+" : ""}
              {formatMoney(breakdown.topPlayer.profit)} €
            </p>
          </AppCard>
        ) : (
          <AppCard padding="sm">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[#64748b]">Top ID</p>
            <p className="mt-1 text-sm text-[#64748b]">—</p>
          </AppCard>
        )}
        {breakdown.topAccount ? (
          <AppCard href={`/accounts/${breakdown.topAccount.id}`} padding="sm">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[#64748b]">Top conto</p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-tight text-white">
              {breakdown.topAccount.name}
            </p>
            <p
              className={`mt-1 text-xs font-bold tabular-nums ${
                breakdown.topAccount.profit >= 0 ? "text-[#34d399]" : "text-[#fb7185]"
              }`}
            >
              {breakdown.topAccount.profit >= 0 ? "+" : ""}
              {formatMoney(breakdown.topAccount.profit)} €
            </p>
          </AppCard>
        ) : (
          <AppCard padding="sm">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[#64748b]">Top conto</p>
            <p className="mt-1 text-sm text-[#64748b]">—</p>
          </AppCard>
        )}
      </section>
    </div>
  );
}
