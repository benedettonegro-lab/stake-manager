"use client";

import { AppShell } from "@/components/app-shell";
import { formatAccountRoi } from "@/lib/account-bet-metrics";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Player = {
  id: string;
  name: string;
  note: string | null;
  balance: string;
  created_at: string;
};

type BetRow = {
  id: string;
  gaming_account_id: string;
  profit: string;
  stake: string;
  odds: string;
  placed_at: string;
  event_name: string | null;
  status: string;
  gaming_accounts: {
    account_name: string;
    bookmaker: string;
    bookmaker_id?: string | null;
    bookmakers?: { name: string } | null;
  } | null;
};

type DatePreset = "all" | "today" | "7d" | "30d" | "month" | "custom";

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function getFilterRange(
  preset: DatePreset,
  customFrom: string,
  customTo: string,
): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (preset) {
    case "all":
      return { from: null, to: null };
    case "today":
      return { from: startOfLocalDay(now), to: endOfLocalDay(now) };
    case "7d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      return { from, to: endOfLocalDay(now) };
    }
    case "30d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      return { from, to: endOfLocalDay(now) };
    }
    case "month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: endOfLocalDay(now) };
    }
    case "custom": {
      if (!customFrom || !customTo) return { from: null, to: null };
      const from = startOfLocalDay(new Date(customFrom + "T12:00:00"));
      const to = endOfLocalDay(new Date(customTo + "T12:00:00"));
      if (from.getTime() > to.getTime()) return { from: null, to: null };
      return { from, to };
    }
    default:
      return { from: null, to: null };
  }
}

function toneClass(n: number): string {
  if (n > 0) return "text-[#34d399]";
  if (n < 0) return "text-[#fb7185]";
  return "text-[#94a3b8]";
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const PRESET_OPTIONS: { id: DatePreset; label: string }[] = [
  { id: "all", label: "Tutto" },
  { id: "today", label: "Oggi" },
  { id: "7d", label: "7 giorni" },
  { id: "30d", label: "30 giorni" },
  { id: "month", label: "Mese corrente" },
  { id: "custom", label: "Personalizzato" },
];

export default function PlayerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const playerId = typeof params.id === "string" ? params.id : params.id?.[0];

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [ready, setReady] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [bets, setBets] = useState<BetRow[]>([]);
  const [betsError, setBetsError] = useState<string | null>(null);

  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const loadBets = useCallback(async () => {
    if (!playerId) return;
    setBetsError(null);
    const { data, error } = await supabase
      .from("bets")
      .select(
        `
        id,
        gaming_account_id,
        profit,
        stake,
        odds,
        placed_at,
        event_name,
        status,
        gaming_accounts ( account_name, bookmaker, bookmaker_id, bookmakers ( name ) )
      `,
      )
      .eq("player_id", playerId)
      .order("placed_at", { ascending: false });

    if (error) {
      setBetsError(error.message);
      setBets([]);
      return;
    }
    setBets((data as unknown as BetRow[]) ?? []);
  }, [playerId, supabase]);

  useEffect(() => {
    if (!playerId) return;

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

      const { data: row, error } = await supabase
        .from("players")
        .select("id, name, note, balance, created_at")
        .eq("id", playerId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setPlayerError(error.message);
        setPlayer(null);
      } else if (!row) {
        setPlayerError("Player non trovato o non accessibile.");
        setPlayer(null);
      } else {
        setPlayer(row as Player);
        setPlayerError(null);
      }

      await loadBets();
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [loadBets, playerId, router, supabase]);

  const { from, to } = useMemo(
    () => getFilterRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  );

  const filteredBets = useMemo(() => {
    if (!from && !to) return bets;
    return bets.filter((b) => {
      const t = new Date(b.placed_at).getTime();
      if (from && t < from.getTime()) return false;
      if (to && t > to.getTime()) return false;
      return true;
    });
  }, [bets, from, to]);

  const periodSummary = useMemo(() => {
    let profit = 0;
    let stake = 0;
    for (const b of filteredBets) {
      profit += Number.parseFloat(b.profit) || 0;
      stake += Number.parseFloat(b.stake) || 0;
    }
    const count = filteredBets.length;
    return { profit, stake, count, roi: formatAccountRoi(profit, stake) };
  }, [filteredBets]);

  const byAccountRows = useMemo(() => {
    type Row = {
      gaming_account_id: string;
      account_name: string;
      bookmaker: string;
      profit: number;
      stake: number;
      count: number;
      lastPlacedAt: string;
      lastEvent: string;
    };
    const m = new Map<string, Row>();
    for (const b of filteredBets) {
      const ga = b.gaming_accounts;
      const name = ga?.account_name?.trim() || "Conto";
      const bookmaker = ga ? gamingAccountBookmakerDisplay(ga) : "";
      const prev = m.get(b.gaming_account_id);
      const p = Number.parseFloat(b.profit) || 0;
      const s = Number.parseFloat(b.stake) || 0;
      const placed = b.placed_at;
      const ev = b.event_name?.trim() || "—";
      if (!prev) {
        m.set(b.gaming_account_id, {
          gaming_account_id: b.gaming_account_id,
          account_name: name,
          bookmaker,
          profit: p,
          stake: s,
          count: 1,
          lastPlacedAt: placed,
          lastEvent: ev,
        });
      } else {
        prev.profit += p;
        prev.stake += s;
        prev.count += 1;
        if (new Date(placed).getTime() > new Date(prev.lastPlacedAt).getTime()) {
          prev.lastPlacedAt = placed;
          prev.lastEvent = ev;
        }
        if (!prev.bookmaker && bookmaker) prev.bookmaker = bookmaker;
        if (prev.account_name === "Conto" && name !== "Conto") prev.account_name = name;
      }
    }
    return [...m.values()].sort((a, b) => b.stake - a.stake);
  }, [filteredBets]);

  const latestBets = useMemo(() => filteredBets.slice(0, 25), [filteredBets]);

  if (!playerId) {
    return (
      <AppShell title="Player">
        <Link
          href="/players"
          className="mb-4 inline-flex min-h-12 items-center text-sm font-medium text-[#a855f7] underline-offset-4 hover:underline"
        >
          ← Torna ai players
        </Link>
        <p
          className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          role="alert"
        >
          ID player non valido.
        </p>
      </AppShell>
    );
  }

  if (!ready) {
    return (
      <AppShell title="Player">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-[#94a3b8]">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-[#5b5cff] border-t-transparent"
            aria-hidden
          />
          <p>Caricamento…</p>
        </div>
      </AppShell>
    );
  }

  if (playerError || !player) {
    return (
      <AppShell title="Player">
        <Link
          href="/players"
          className="mb-4 inline-flex min-h-12 items-center text-sm font-medium text-[#a855f7] underline-offset-4 hover:underline"
        >
          ← Torna ai players
        </Link>
        <p
          className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-4 py-3 text-sm text-[#fb7185]"
          role="alert"
        >
          {playerError ?? "Player non disponibile."}
        </p>
      </AppShell>
    );
  }

  const bal = Number.parseFloat(player.balance) || 0;
  const balClass =
    bal > 0 ? "text-[#34d399]" : bal < 0 ? "text-[#fb7185]" : "text-[#94a3b8]";

  return (
    <AppShell title={player.name} subtitle="Performance e scommesse per periodo.">
      <Link
        href="/players"
        className="mb-4 inline-flex min-h-12 items-center text-sm font-medium text-[#a855f7] underline-offset-4 hover:underline"
      >
        ← Torna ai players
      </Link>

      {/* 1. Header player */}
      <header className="mb-6 rounded-2xl border border-[#273449] bg-[#111827] p-4 shadow-lg shadow-black/20">
        <h2 className="text-lg font-bold text-white">{player.name}</h2>
        {player.note ? (
          <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">{player.note}</p>
        ) : (
          <p className="mt-2 text-xs text-[#64748b]">Nessuna nota.</p>
        )}
        <div className="mt-4 border-t border-[#1f2937] pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
            Saldo / balance
          </p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${balClass}`}>
            {formatMoney(player.balance)} €
          </p>
        </div>
      </header>

      {/* 2. Filtri data */}
      <section className="mb-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
          Periodo
        </p>
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          {PRESET_OPTIONS.map(({ id, label }) => {
            const active = datePreset === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setDatePreset(id)}
                className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold transition active:opacity-90 ${
                  active
                    ? "border-[#a855f7]/50 bg-[#a855f7]/15 text-[#e9d5ff]"
                    : "border-[#334155] bg-[#1e293b] text-[#cbd5e1] hover:border-[#475569]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {datePreset === "custom" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
                Dal
              </label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="sm-input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
                Al
              </label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="sm-input"
              />
            </div>
            {(!customFrom || !customTo) && (
              <p className="text-xs text-[#64748b] sm:col-span-2">
                Seleziona data inizio e fine per applicare il filtro.
              </p>
            )}
          </div>
        ) : null}
      </section>

      {betsError ? (
        <p
          className="mb-4 rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-4 py-3 text-sm text-[#fb7185]"
          role="alert"
        >
          {betsError}
        </p>
      ) : null}

      {/* 3. Riepilogo bilancio periodo */}
      <section className="mb-6 rounded-2xl border border-[#273449] bg-[#111827] p-4 shadow-lg shadow-black/15">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
          Riepilogo periodo
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1321] px-3 py-3">
            <dt className="text-[10px] font-semibold uppercase text-[#64748b]">Profitto</dt>
            <dd className={`mt-1 text-base font-bold tabular-nums ${toneClass(periodSummary.profit)}`}>
              {periodSummary.profit >= 0 ? "+" : ""}
              {formatMoney(periodSummary.profit)} €
            </dd>
          </div>
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1321] px-3 py-3">
            <dt className="text-[10px] font-semibold uppercase text-[#64748b]">Stake</dt>
            <dd className="mt-1 text-base font-bold tabular-nums text-white">
              {formatMoney(periodSummary.stake)} €
            </dd>
          </div>
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1321] px-3 py-3">
            <dt className="text-[10px] font-semibold uppercase text-[#64748b]">Scommesse</dt>
            <dd className="mt-1 text-base font-bold tabular-nums text-white">
              {periodSummary.count}
            </dd>
          </div>
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1321] px-3 py-3">
            <dt className="text-[10px] font-semibold uppercase text-[#64748b]">ROI</dt>
            <dd
              className={`mt-1 text-base font-bold tabular-nums ${
                periodSummary.stake <= 0
                  ? "text-[#94a3b8]"
                  : periodSummary.profit > 0
                    ? "text-[#34d399]"
                    : periodSummary.profit < 0
                      ? "text-[#fb7185]"
                      : "text-[#94a3b8]"
              }`}
            >
              {periodSummary.roi}
            </dd>
          </div>
        </dl>
      </section>

      {/* 4. Bilancio per conto gioco */}
      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
            Per conto gioco
          </h3>
          <Link
            href="/accounts"
            className="text-xs font-medium text-[#a855f7] underline-offset-4 hover:underline"
          >
            Conti gioco →
          </Link>
        </div>
        {byAccountRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#273449] bg-[#111827] px-4 py-8 text-center text-sm text-[#94a3b8]">
            Nessuna scommessa in questo periodo. I conti si creano in{" "}
            <Link href="/accounts" className="font-medium text-[#a855f7] underline">
              Conti gioco
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {byAccountRows.map((row) => {
              const roi = formatAccountRoi(row.profit, row.stake);
              const roiTone =
                row.stake <= 0
                  ? "text-[#94a3b8]"
                  : row.profit > 0
                    ? "text-[#34d399]"
                    : row.profit < 0
                      ? "text-[#fb7185]"
                      : "text-[#94a3b8]";
              return (
                <li key={row.gaming_account_id}>
                  <Link
                    href={`/accounts/${row.gaming_account_id}`}
                    className="block rounded-2xl border border-[#273449] bg-[#111827] p-4 shadow-md shadow-black/20 transition hover:border-[#5b5cff]/35 active:opacity-95"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{row.account_name}</p>
                        {row.bookmaker ? (
                          <p className="mt-0.5 text-xs text-[#64748b]">{row.bookmaker}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[#a855f7]">
                        Apri
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div>
                        <dt className="text-[10px] uppercase text-[#64748b]">Profitto</dt>
                        <dd className={`text-sm font-bold tabular-nums ${toneClass(row.profit)}`}>
                          {row.profit >= 0 ? "+" : ""}
                          {formatMoney(row.profit)} €
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase text-[#64748b]">Stake</dt>
                        <dd className="text-sm font-bold tabular-nums text-white">
                          {formatMoney(row.stake)} €
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase text-[#64748b]">N.</dt>
                        <dd className="text-sm font-bold text-white">{row.count}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase text-[#64748b]">ROI</dt>
                        <dd className={`text-sm font-bold tabular-nums ${roiTone}`}>{roi}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 border-t border-[#1f2937] pt-3 text-[11px] text-[#64748b]">
                      Ultima:{" "}
                      <span className="font-medium text-[#cbd5e1]">
                        {formatShortDate(row.lastPlacedAt)}
                      </span>
                      <span className="mx-1.5 text-[#475569]">·</span>
                      <span className="line-clamp-2 text-[#94a3b8]">{row.lastEvent}</span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 5. Ultime scommesse */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
          Ultime scommesse
          <span className="ml-2 font-normal normal-case text-[#64748b]">
            (nel periodo selezionato, max 25)
          </span>
        </h3>
        {latestBets.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#273449] bg-[#111827] px-4 py-8 text-center text-sm text-[#94a3b8]">
            Nessuna scommessa da mostrare.
          </p>
        ) : (
          <ul className="space-y-2">
            {latestBets.map((b) => {
              const pnl = Number.parseFloat(b.profit) || 0;
              const pnlClass = toneClass(pnl);
              const acc = b.gaming_accounts?.account_name ?? "Conto";
              return (
                <li
                  key={b.id}
                  className="rounded-xl border border-[#1f2937] bg-[#0d1321] px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 line-clamp-2 text-sm font-medium text-white">
                      {b.event_name?.trim() || "—"}
                    </p>
                    <span
                      className={`shrink-0 text-sm font-bold tabular-nums ${pnlClass}`}
                    >
                      {pnl >= 0 ? "+" : ""}
                      {formatMoney(b.profit)} €
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-[#64748b]">
                    {formatShortDate(b.placed_at)} · {acc}
                    {b.gaming_accounts && gamingAccountBookmakerDisplay(b.gaming_accounts)
                      ? ` · ${gamingAccountBookmakerDisplay(b.gaming_accounts)}`
                      : ""}{" "}
                    · <span className="uppercase">{b.status}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-[#94a3b8]">
                    Quota {formatMoney(b.odds)} · Stake{" "}
                    {formatMoney(b.stake)} €
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
