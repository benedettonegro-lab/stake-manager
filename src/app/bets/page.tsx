"use client";

import { BottomSheet, FilterChips, SearchInput } from "@/components/app";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BET_TYPE_DEFAULT, BET_TYPE_OPTIONS } from "@/lib/bet-constants";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import { assertGamingAccountCoversStake } from "@/lib/balance-validation";
import { applySettlementBalanceDelta } from "@/lib/settlement-balances";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type BetStatus = "open" | "won" | "lost" | "void" | "cashout";

const STATUS_OPTIONS: { value: BetStatus; label: string }[] = [
  { value: "open", label: "Aperta" },
  { value: "won", label: "Vinta" },
  { value: "lost", label: "Persa" },
  { value: "void", label: "Rimborsata" },
  { value: "cashout", label: "Cashout" },
];

type StakerRow = { id: string; name: string; player_id: string | null };
type AccountRow = {
  id: string;
  player_id: string;
  identity_id: string;
  account_name: string;
  bookmaker: string;
  bookmaker_id: string | null;
  bookmakers: { name: string } | { name: string }[] | null;
  current_balance: string;
};

type BetRow = {
  id: string;
  player_id: string;
  staker_id: string;
  gaming_account_id: string;
  event_name: string;
  odds: string;
  stake: string;
  status: BetStatus;
  profit: string;
  placed_at: string;
  settled_at: string | null;
  bet_type?: string | null;
  note?: string | null;
  gaming_accounts: {
    account_name: string;
    bookmaker: string;
    bookmaker_id?: string | null;
    bookmakers?: { name: string } | null;
  } | null;
  stakers: { name: string } | null;
};

type BetsDayGroup = {
  dayKey: string;
  dayTitle: string;
  profitTotal: number;
  bets: BetRow[];
};

type BetsMonthGroup = {
  monthKey: string;
  monthTitle: string;
  profitTotal: number;
  days: BetsDayGroup[];
};

/** Stati selezionabili dalla linguetta (menu) */
type LinguettaBetStatus = "open" | "won" | "lost" | "void";

type BetAggregateRow = { stake: string; profit: string };

function calculateProfit(
  status: BetStatus,
  stake: number,
  odds: number,
): number {
  if (status === "open" || status === "void") return 0;
  if (status === "won") {
    if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(odds) || odds <= 0) {
      return 0;
    }
    return Math.round((stake * odds - stake) * 1e4) / 1e4;
  }
  if (status === "lost") {
    if (!Number.isFinite(stake) || stake <= 0) return 0;
    return Math.round(-stake * 1e4) / 1e4;
  }
  return 0;
}

function computeProfit(
  status: BetStatus,
  stake: number,
  odds: number,
): number {
  return calculateProfit(status, stake, odds);
}

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
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

function reduceAggregate(rows: BetAggregateRow[]) {
  let totalStake = 0;
  let totalProfit = 0;
  for (const r of rows) {
    totalStake += Number.parseFloat(r.stake) || 0;
    totalProfit += Number.parseFloat(r.profit) || 0;
  }
  return {
    count: rows.length,
    totalStake,
    totalProfit,
  };
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

/** Header giorno compatto (timeline) */
function dayTitleCompact(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function buildBetGroups(bets: BetRow[]): BetsMonthGroup[] {
  type Bucket = {
    profitTotal: number;
    days: Map<string, { bets: BetRow[]; sample: Date }>;
  };
  const months = new Map<string, Bucket>();

  for (const b of bets) {
    const d = new Date(b.placed_at);
    const y = d.getFullYear();
    const mo = d.getMonth();
    const day = d.getDate();
    const monthKey = `${y}-${String(mo + 1).padStart(2, "0")}`;
    const dayKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    const p = Number.parseFloat(b.profit) || 0;

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
  const out: BetsMonthGroup[] = [];

  for (const mk of monthKeys) {
    const bucket = months.get(mk)!;
    const dayKeys = [...bucket.days.keys()].sort((a, b) => b.localeCompare(a));
    const days: BetsDayGroup[] = dayKeys.map((dk) => {
      const { bets: dayBets, sample } = bucket.days.get(dk)!;
      const profitTotal = dayBets.reduce(
        (s, x) => s + (Number.parseFloat(x.profit) || 0),
        0,
      );
      return {
        dayKey: dk,
        dayTitle: dayTitleCompact(sample),
        profitTotal,
        bets: dayBets,
      };
    });
    out.push({
      monthKey: mk,
      monthTitle: monthTitleFromKey(mk),
      profitTotal: bucket.profitTotal,
      days,
    });
  }
  return out;
}

function headerProfitClass(n: number): string {
  if (n > 0) return "text-[#34d399]";
  if (n < 0) return "text-[#fb7185]";
  return "text-[#94a3b8]";
}

function formatSignedProfitEuro(n: number): string {
  const abs = Math.abs(n);
  const body = `${formatMoney(abs)} €`;
  if (n > 0) return `+${body}`;
  if (n < 0) return `−${body}`;
  return body;
}

/** Bookmaker + conto (riga secondaria card) */
function bookmakerAccountSmall(b: BetRow): string {
  const ga = b.gaming_accounts;
  if (!ga) return "—";
  const acc = ga.account_name?.trim() || "Conto";
  const bm = gamingAccountBookmakerDisplay(ga);
  return bm ? `${bm} · ${acc}` : acc;
}

function tradeStatusDisplay(status: BetStatus): { label: string; className: string } {
  switch (status) {
    case "won":
      return {
        label: "VINTA",
        className:
          "border-emerald-500/45 bg-emerald-500/15 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.18)]",
      };
    case "lost":
      return {
        label: "PERSA",
        className:
          "border-red-500/45 bg-red-500/12 text-red-200 shadow-[0_0_12px_rgba(248,113,113,0.15)]",
      };
    case "open":
      return {
        label: "APERTA",
        className: "border-white/[0.12] bg-white/[0.06] text-[#cbd5e1]",
      };
    case "void":
      return {
        label: "PUSH",
        className:
          "border-sky-500/45 bg-sky-600/20 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.2)]",
      };
    default:
      return {
        label: "CASH",
        className:
          "border-amber-500/40 bg-amber-500/10 text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.12)]",
      };
  }
}

function BetStatusBadge({
  status,
  settling,
}: {
  status: BetStatus;
  settling: boolean;
}) {
  if (settling) {
    return (
      <span className="inline-flex h-9 min-w-[4rem] items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 sm:h-7 sm:min-w-[3.5rem]">
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white/90"
          aria-hidden
        />
      </span>
    );
  }
  const t = tradeStatusDisplay(status);
  return (
    <span
      className={`inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-md border px-3 py-2 text-[12px] font-bold uppercase tracking-[0.14em] transition-colors duration-500 sm:min-h-0 sm:px-2 sm:py-0.5 sm:text-xs sm:tracking-wide ${t.className}`}
    >
      {t.label}
    </span>
  );
}

const STATUS_SHEET_OPTIONS: {
  status: LinguettaBetStatus;
  label: string;
  sheetButtonClass: string;
}[] = [
  {
    status: "open",
    label: "Aperta",
    sheetButtonClass:
      "border border-blue-500/55 bg-blue-600/20 text-blue-50 hover:bg-blue-600/32 active:scale-[0.99]",
  },
  {
    status: "won",
    label: "Vinta",
    sheetButtonClass:
      "border border-emerald-500/55 bg-emerald-600/20 text-emerald-50 hover:bg-emerald-600/32 active:scale-[0.99]",
  },
  {
    status: "lost",
    label: "Persa",
    sheetButtonClass:
      "border border-red-500/55 bg-red-600/20 text-red-50 hover:bg-red-600/32 active:scale-[0.99]",
  },
  {
    status: "void",
    label: "PUSH",
    sheetButtonClass:
      "border border-sky-500/55 bg-sky-600/20 text-sky-50 hover:bg-sky-600/32 active:scale-[0.99]",
  },
];

function BetTimelineCard({
  bet: b,
  settling,
  flash,
  onOpenDetail,
  onOpenQuickStatus,
  onSwipeWin,
  onSwipeLoss,
}: {
  bet: BetRow;
  settling: boolean;
  flash: "profit" | "loss" | null;
  onOpenDetail: (bet: BetRow) => void;
  onOpenQuickStatus: (bet: BetRow) => void;
  onSwipeWin: (bet: BetRow) => void;
  onSwipeLoss: (bet: BetRow) => void;
}) {
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const didGesture = useRef(false);

  const placed = new Date(b.placed_at);
  const timeStr = placed.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const pnl = Number.parseFloat(b.profit);
  const profitClass =
    pnl > 0
      ? "text-[#34d399]"
      : pnl < 0
        ? "text-[#fb7185]"
        : "text-[#94a3b8]";
  const showResult = b.status !== "open";
  const flashClass =
    flash === "profit" ? "sm-bet-flash-profit" : flash === "loss" ? "sm-bet-flash-loss" : "";

  function clearLongTimer() {
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (settling || e.button !== 0) return;
    didGesture.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    longTimer.current = setTimeout(() => {
      longTimer.current = null;
      didGesture.current = true;
      onOpenQuickStatus(b);
      window.setTimeout(() => {
        didGesture.current = false;
      }, 320);
    }, 480);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (dx * dx + dy * dy > 144) clearLongTimer();
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    clearLongTimer();
    if (!startRef.current || settling) {
      startRef.current = null;
      return;
    }
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    startRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.05) {
      didGesture.current = true;
      if (dx > 0) onSwipeWin(b);
      else onSwipeLoss(b);
      window.setTimeout(() => {
        didGesture.current = false;
      }, 380);
    }
  }

  function onPointerCancel() {
    clearLongTimer();
    startRef.current = null;
  }

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E1525]/78 backdrop-blur-sm shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out select-none hover:border-emerald-500/20 hover:shadow-[0_0_10px_rgba(52,211,153,0.04)] hover:scale-[1.01] active:scale-[0.97] sm:rounded-xl ${flashClass} ${
        settling ? "pointer-events-none opacity-70" : "cursor-pointer touch-pan-y"
      }`}
      aria-label={`Scommessa ${b.event_name || "evento"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={() => {
        if (settling || didGesture.current) return;
        onOpenDetail(b);
      }}
    >
      <div className="flex min-w-0 flex-col gap-2.5 px-4 py-4 sm:gap-1.5 sm:px-2.5 sm:py-2">
        <div className="flex items-start justify-between gap-3">
          <time
            dateTime={b.placed_at}
            className="shrink-0 pt-0.5 text-[14px] font-semibold tabular-nums text-[#94a3b8] sm:text-sm"
          >
            {timeStr}
          </time>
          <BetStatusBadge status={b.status} settling={settling} />
        </div>
        <h3 className="line-clamp-2 text-[20px] font-bold leading-tight text-[#E6EAF2] sm:text-xl sm:font-semibold sm:leading-snug">
          {b.event_name?.trim() || "—"}
        </h3>
        <p className="truncate text-[12px] font-medium uppercase tracking-[0.14em] text-[#64748b] sm:text-sm sm:tracking-wide">
          {bookmakerAccountSmall(b)}
        </p>
        <p className="text-[16px] text-[#94a3b8] sm:text-sm">
          <span className="whitespace-nowrap font-semibold tabular-nums text-[#E6EAF2]">
            {formatMoney(b.stake)} €
          </span>
          <span className="mx-1.5 text-[#475569]">·</span>
          <span>
            quota{" "}
            <span className="whitespace-nowrap font-semibold tabular-nums text-[#E6EAF2]">{formatMoney(b.odds)}</span>
          </span>
        </p>
        {showResult ? (
          <p className={`whitespace-nowrap text-[28px] font-extrabold tabular-nums sm:text-2xl sm:font-bold ${profitClass}`}>
            {pnl > 0 ? "+" : ""}
            {formatMoney(b.profit)} €
          </p>
        ) : null}
      </div>
    </article>
  );
}

function BetsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [ready, setReady] = useState(false);
  const [stakers, setStakers] = useState<StakerRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [bets, setBets] = useState<BetRow[]>([]);
  const [aggregateRows, setAggregateRows] = useState<BetAggregateRow[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accountId, setAccountId] = useState("");
  const [stakerId, setStakerId] = useState("");
  const [eventName, setEventName] = useState("");
  const [oddsStr, setOddsStr] = useState("");
  const [stakeStr, setStakeStr] = useState("");
  const [status, setStatus] = useState<BetStatus>("open");
  const [formBetType, setFormBetType] = useState<string>(BET_TYPE_DEFAULT);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingBet, setEditingBet] = useState<BetRow | null>(null);
  const [editEventName, setEditEventName] = useState("");
  const [editOddsStr, setEditOddsStr] = useState("");
  const [editStakeStr, setEditStakeStr] = useState("");
  const [editBetType, setEditBetType] = useState(BET_TYPE_DEFAULT);
  const [editStatus, setEditStatus] = useState<BetStatus>("open");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editGamingAccountId, setEditGamingAccountId] = useState("");
  const [editStakerId, setEditStakerId] = useState("");
  const [editNote, setEditNote] = useState("");

  const [deleteBetTarget, setDeleteBetTarget] = useState<BetRow | null>(null);
  const [deleteBetLoading, setDeleteBetLoading] = useState(false);
  const [deleteBetError, setDeleteBetError] = useState<string | null>(null);

  const [settlingBetId, setSettlingBetId] = useState<string | null>(null);
  const [statusSheetBet, setStatusSheetBet] = useState<BetRow | null>(null);
  const [betFlash, setBetFlash] = useState<{ id: string; kind: "profit" | "loss" } | null>(
    null,
  );
  const [refertoError, setRefertoError] = useState<string | null>(null);

  const [filterAccountId, setFilterAccountId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [nuovaOpen, setNuovaOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("nuova") === "1") setNuovaOpen(true);
  }, [searchParams]);

  const newBetStakeExceedsBalance = useMemo(() => {
    const s = Number.parseFloat(stakeStr.replace(",", "."));
    const stakeOk = Number.isFinite(s) && s > 0;
    const a = accounts.find((x) => x.id === accountId);
    const bal = a ? Number.parseFloat(a.current_balance) || 0 : NaN;
    return (
      nuovaOpen &&
      stakeOk &&
      Boolean(accountId) &&
      Number.isFinite(bal) &&
      s > bal
    );
  }, [nuovaOpen, stakeStr, accountId, accounts]);

  const loadRefs = useCallback(async () => {
    setLoadError(null);
    const [sRes, aRes] = await Promise.all([
      supabase.from("stakers").select("id, name, player_id").order("name"),
      supabase
        .from("gaming_accounts")
        .select(
          `
          id,
          player_id,
          identity_id,
          account_name,
          bookmaker,
          bookmaker_id,
          current_balance,
          bookmakers ( name )
        `,
        )
        .order("account_name"),
    ]);
    if (sRes.error || aRes.error) {
      setLoadError(sRes.error?.message ?? aRes.error?.message ?? "Errore caricamento");
      return;
    }
    setStakers((sRes.data as StakerRow[]) ?? []);
    setAccounts((aRes.data as AccountRow[]) ?? []);
  }, [supabase]);

  const loadBets = useCallback(async () => {
    const { data, error } = await supabase
      .from("bets")
      .select(
        `
        id,
        player_id,
        staker_id,
        gaming_account_id,
        event_name,
        odds,
        stake,
        status,
        profit,
        placed_at,
        settled_at,
        bet_type,
        note,
        gaming_accounts ( account_name, bookmaker, bookmaker_id, bookmakers ( name ) ),
        stakers ( name )
      `,
      )
      .order("placed_at", { ascending: false })
      .limit(100);

    if (error) {
      setLoadError(error.message);
      setBets([]);
      return;
    }
    setBets((data as unknown as BetRow[]) ?? []);
  }, [supabase]);

  const loadBetAggregates = useCallback(async () => {
    const { data, error } = await supabase.from("bets").select("stake, profit");
    if (error) {
      setAggregateRows(null);
      return;
    }
    setAggregateRows((data as BetAggregateRow[]) ?? []);
  }, [supabase]);

  const loadAll = useCallback(async () => {
    await loadRefs();
    await Promise.all([loadBets(), loadBetAggregates()]);
  }, [loadBetAggregates, loadBets, loadRefs]);

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
      await loadAll();
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [loadAll, router, supabase]);

  useEffect(() => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc || stakers.length === 0) return;
    const def = stakers.find((s) => s.player_id === acc.player_id);
    if (def) setStakerId(def.id);
    else if (stakers[0]) setStakerId(stakers[0].id);
  }, [accountId, accounts, stakers]);

  const stats = useMemo(() => {
    if (aggregateRows !== null) {
      return reduceAggregate(aggregateRows);
    }
    const rows: BetAggregateRow[] = bets.map((b) => ({
      stake: b.stake,
      profit: b.profit,
    }));
    return reduceAggregate(rows);
  }, [aggregateRows, bets]);

  const filteredBets = useMemo(() => {
    let list = bets;
    if (filterAccountId) {
      list = list.filter((b) => b.gaming_account_id === filterAccountId);
    }
    const raw = searchQuery.trim();
    if (!raw) return list;
    const q = raw.toLowerCase();
    return list.filter((b) => {
      const event = (b.event_name ?? "").toLowerCase();
      const accName = (b.gaming_accounts?.account_name ?? "").toLowerCase();
      const ga = b.gaming_accounts;
      const bm = ga ? gamingAccountBookmakerDisplay(ga).toLowerCase() : "";
      const stakerName = (b.stakers?.name ?? "").toLowerCase();
      const statusLabel = (
        STATUS_OPTIONS.find((o) => o.value === b.status)?.label ?? b.status
      ).toLowerCase();
      return (
        event.includes(q) ||
        accName.includes(q) ||
        bm.includes(q) ||
        stakerName.includes(q) ||
        statusLabel.includes(q)
      );
    });
  }, [bets, filterAccountId, searchQuery]);

  const betGroups = useMemo(() => buildBetGroups(filteredBets), [filteredBets]);

  const accountFilterChips = useMemo(() => {
    const chips = [{ value: "", label: "Tutti" }] as { value: string; label: string }[];
    for (const a of accounts) {
      chips.push({
        value: a.id,
        label:
          a.account_name.length > 14
            ? `${a.account_name.slice(0, 12)}…`
            : a.account_name,
      });
    }
    return chips;
  }, [accounts]);

  const roiStr = formatRoi(stats.totalProfit, stats.totalStake);
  const roiTone: "default" | "positive" | "negative" =
    stats.totalStake <= 0
      ? "default"
      : stats.totalProfit > 0
        ? "positive"
        : stats.totalProfit < 0
          ? "negative"
          : "default";

  const roiTextClass =
    roiTone === "positive"
      ? "text-[#34d399]"
      : roiTone === "negative"
        ? "text-[#fb7185]"
        : "text-[#94a3b8]";

  const oddsNum = Number.parseFloat(oddsStr.replace(",", "."));
  const stakeNum = Number.parseFloat(stakeStr.replace(",", "."));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const accPick = accounts.find((a) => a.id === accountId);
    if (!accountId || !stakerId || !accPick) {
      setFormError("Seleziona conto e staker.");
      return;
    }
    if (!eventName.trim()) {
      setFormError("Inserisci il nome evento.");
      return;
    }
    if (Number.isNaN(oddsNum) || oddsNum <= 0) {
      setFormError("Quota non valida.");
      return;
    }
    if (Number.isNaN(stakeNum) || stakeNum <= 0) {
      setFormError("Stake non valido.");
      return;
    }

    const stakeGuard = await assertGamingAccountCoversStake(supabase, accountId, stakeNum);
    if (!stakeGuard.ok) {
      setFormError(stakeGuard.message);
      return;
    }

    const profit = computeProfit(status, stakeNum, oddsNum);

    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      return;
    }

    const betType =
      formBetType.trim() || BET_TYPE_DEFAULT;

    const { error } = await supabase.from("bets").insert({
      user_id: user.id,
      gaming_account_id: accountId,
      player_id: accPick.player_id,
      staker_id: stakerId,
      event_name: eventName.trim(),
      odds: oddsNum,
      stake: stakeNum,
      status,
      profit,
      bet_type: betType,
    });

    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }

    setEventName("");
    setOddsStr("");
    setStakeStr("");
    setStatus("open");
    setFormBetType(BET_TYPE_DEFAULT);
    setNuovaOpen(false);
    router.replace("/bets", { scroll: false });
    await loadAll();
  }

  function openBetDetail(b: BetRow) {
    setStatusSheetBet(null);
    setEditingBet(b);
    setEditGamingAccountId(b.gaming_account_id);
    setEditStakerId(b.staker_id);
    setEditEventName(b.event_name || "");
    setEditOddsStr(String(Number.parseFloat(b.odds) || 0).replace(".", ","));
    setEditStakeStr(String(Number.parseFloat(b.stake) || 0).replace(".", ","));
    setEditBetType(b.bet_type?.trim() || BET_TYPE_DEFAULT);
    setEditStatus(b.status);
    setEditNote(b.note?.trim() ?? "");
    setEditError(null);
  }

  async function handleSaveBetEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBet) return;
    const ev = editEventName.trim();
    if (!ev) {
      setEditError("Inserisci il nome evento.");
      return;
    }
    if (!editGamingAccountId || !editStakerId) {
      setEditError("Seleziona conto e staker.");
      return;
    }
    const oddsNum = Number.parseFloat(editOddsStr.replace(",", "."));
    const stakeNum = Number.parseFloat(editStakeStr.replace(",", "."));
    if (Number.isNaN(oddsNum) || oddsNum <= 0) {
      setEditError("Quota non valida.");
      return;
    }
    if (Number.isNaN(stakeNum) || stakeNum <= 0) {
      setEditError("Stake non valido.");
      return;
    }
    const accPick = accounts.find((a) => a.id === editGamingAccountId);
    if (!accPick) {
      setEditError("Conto non valido.");
      return;
    }
    if (!stakers.some((s) => s.id === editStakerId)) {
      setEditError("Staker non valido.");
      return;
    }
    setEditError(null);
    setEditSaving(true);
    const betType = editBetType.trim() || BET_TYPE_DEFAULT;

    const { data: row, error: fetchErr } = await supabase
      .from("bets")
      .select(
        "id, profit, status, settled_at, gaming_account_id, player_id, staker_id, event_name, odds, stake, bet_type, note",
      )
      .eq("id", editingBet.id)
      .maybeSingle();

    if (fetchErr) {
      console.error("[modifica scommessa] lettura bet", fetchErr);
      setEditError(fetchErr.message);
      setEditSaving(false);
      return;
    }
    if (!row) {
      const msg = "Scommessa non trovata.";
      console.error("[modifica scommessa]", msg, { betId: editingBet.id });
      setEditError(msg);
      setEditSaving(false);
      return;
    }

    const r = row as {
      id: string;
      profit: string;
      status: BetStatus;
      settled_at: string | null;
      gaming_account_id: string;
      player_id: string;
      staker_id: string;
      event_name: string;
      odds: string | number;
      stake: string | number;
      bet_type: string | null;
      note: string | null;
    };

    const oldProfit = Number(r.profit ?? 0) || 0;
    const newProfit = computeProfit(editStatus, stakeNum, oddsNum);
    const settled_at =
      editStatus === "open" ? null : new Date().toISOString();
    const pairChanged =
      r.gaming_account_id !== editGamingAccountId ||
      r.staker_id !== editStakerId;
    const noteVal = editNote.trim() ? editNote.trim() : null;

    const { error } = await supabase
      .from("bets")
      .update({
        gaming_account_id: editGamingAccountId,
        staker_id: editStakerId,
        player_id: accPick.player_id,
        event_name: ev,
        odds: oddsNum,
        stake: stakeNum,
        status: editStatus,
        bet_type: betType,
        profit: newProfit,
        settled_at,
        note: noteVal,
      })
      .eq("id", editingBet.id);

    if (error) {
      console.error("[modifica scommessa] update bets", error);
      setEditError(error.message);
      setEditSaving(false);
      return;
    }

    try {
      if (pairChanged) {
        await applySettlementBalanceDelta(
          supabase,
          r.gaming_account_id,
          r.staker_id,
          -oldProfit,
        );
        await applySettlementBalanceDelta(
          supabase,
          editGamingAccountId,
          editStakerId,
          newProfit,
        );
      } else {
        const difference = newProfit - oldProfit;
        await applySettlementBalanceDelta(
          supabase,
          r.gaming_account_id,
          r.staker_id,
          difference,
        );
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Errore aggiornamento saldi.";
      console.error("[modifica scommessa] saldi", e);
      const { error: revErr } = await supabase
        .from("bets")
        .update({
          event_name: r.event_name,
          odds: Number(r.odds),
          stake: Number(r.stake),
          status: r.status,
          bet_type: r.bet_type?.trim() || BET_TYPE_DEFAULT,
          profit: oldProfit,
          settled_at: r.settled_at,
          gaming_account_id: r.gaming_account_id,
          staker_id: r.staker_id,
          player_id: r.player_id,
          note: r.note,
        })
        .eq("id", editingBet.id);
      if (revErr) {
        console.error("[modifica scommessa] rollback bet fallito", revErr);
      }
      setEditError(msg);
      setEditSaving(false);
      await loadAll();
      return;
    }

    setEditSaving(false);
    setEditingBet(null);
    await loadAll();
  }

  async function handleConfirmDeleteBet() {
    if (!deleteBetTarget) return;
    setDeleteBetError(null);
    setDeleteBetLoading(true);
    const { error } = await supabase.from("bets").delete().eq("id", deleteBetTarget.id);
    setDeleteBetLoading(false);
    if (error) {
      setDeleteBetError(error.message);
      return;
    }
    setDeleteBetTarget(null);
    await loadAll();
  }

  const handleBetStatusChange = useCallback(
    async (bet: BetRow, newStatus: LinguettaBetStatus) => {
      if (bet.status === newStatus) return;

      setRefertoError(null);
      setSettlingBetId(bet.id);

      try {
        const { data: row, error: fetchErr } = await supabase
          .from("bets")
          .select(
            "id, status, profit, stake, odds, settled_at, gaming_account_id, player_id, staker_id",
          )
          .eq("id", bet.id)
          .maybeSingle();

        if (fetchErr) {
          console.error("[stato scommessa] lettura bet", fetchErr);
          setRefertoError(fetchErr.message);
          return;
        }
        if (!row) {
          const msg = "Scommessa non trovata.";
          console.error("[stato scommessa]", msg, { betId: bet.id });
          setRefertoError(msg);
          return;
        }

        const r = row as {
          id: string;
          status: BetStatus;
          profit: string;
          stake: string;
          odds: string;
          settled_at: string | null;
          gaming_account_id: string;
          player_id: string;
          staker_id: string;
        };

        if (r.status === newStatus) return;

        const stake = Number.parseFloat(String(r.stake).replace(",", "."));
        const odds = Number.parseFloat(String(r.odds).replace(",", "."));

        if (Number.isNaN(stake) || stake <= 0) {
          const msg = "Stake non valido per aggiornare lo stato.";
          console.error("[stato scommessa]", msg, {
            betId: bet.id,
            stakeRaw: r.stake,
          });
          setRefertoError(msg);
          return;
        }
        if (newStatus === "won" && (Number.isNaN(odds) || odds <= 0)) {
          const msg = "Quota non valida per lo stato Vinto.";
          console.error("[stato scommessa]", msg, {
            betId: bet.id,
            oddsRaw: r.odds,
          });
          setRefertoError(msg);
          return;
        }

        const oldStatus = r.status;
        const oldProfit = Number(r.profit ?? 0) || 0;
        const oldSettledAt = r.settled_at;
        const newProfit = calculateProfit(newStatus, stake, odds);
        const difference = newProfit - oldProfit;
        const settled_at =
          newStatus === "open" ? null : new Date().toISOString();

        const { error: betErr } = await supabase
          .from("bets")
          .update({
            status: newStatus,
            profit: newProfit,
            settled_at,
          })
          .eq("id", r.id);

        if (betErr) {
          console.error("[stato scommessa] update bets", betErr);
          setRefertoError(betErr.message);
          return;
        }

        try {
          await applySettlementBalanceDelta(
            supabase,
            r.gaming_account_id,
            r.staker_id,
            difference,
          );
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : "Errore aggiornamento saldi.";
          console.error("[stato scommessa] saldi", e);
          const { error: revErr } = await supabase
            .from("bets")
            .update({
              status: oldStatus,
              profit: oldProfit,
              settled_at: oldSettledAt,
            })
            .eq("id", r.id);
          if (revErr) {
            console.error("[stato scommessa] rollback bet fallito", revErr);
          }
          setRefertoError(msg);
          await loadAll();
          return;
        }

        await loadAll();
        router.refresh();
        if (newProfit > 0) {
          setBetFlash({ id: bet.id, kind: "profit" });
          window.setTimeout(() => {
            setBetFlash((f) => (f?.id === bet.id ? null : f));
          }, 900);
        } else if (newProfit < 0) {
          setBetFlash({ id: bet.id, kind: "loss" });
          window.setTimeout(() => {
            setBetFlash((f) => (f?.id === bet.id ? null : f));
          }, 900);
        } else {
          setBetFlash((f) => (f?.id === bet.id ? null : f));
        }
      } finally {
        setSettlingBetId(null);
      }
    },
    [loadAll, router, supabase],
  );

  const swipeMarkWon = useCallback(
    (row: BetRow) => {
      void handleBetStatusChange(row, "won");
    },
    [handleBetStatusChange],
  );

  const swipeMarkLost = useCallback(
    (row: BetRow) => {
      void handleBetStatusChange(row, "lost");
    },
    [handleBetStatusChange],
  );

  if (!ready) {
    return (
      <AppShell title="Giocate">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-lg sm:text-sm text-[#94a3b8]">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-white/[0.12] border-t-[#a855f7]/45"
            aria-hidden
          />
          <p>Caricamento…</p>
        </div>
      </AppShell>
    );
  }

  const previewProfit = computeProfit(status, stakeNum, oddsNum);
  const profitPreviewClass =
    previewProfit > 0
      ? "text-[#34d399]"
      : previewProfit < 0
        ? "text-[#fb7185]"
        : "text-[#94a3b8]";

  return (
    <AppShell title="Giocate">

      {loadError ? (
        <p
          className="mb-4 rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-4 py-3 text-lg sm:text-sm text-[#fb7185]"
          role="alert"
        >
          {loadError}
        </p>
      ) : null}

      {refertoError ? (
        <p
          className="mb-4 rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-4 py-3 text-lg sm:text-sm text-[#fb7185]"
          role="alert"
        >
          Stato scommessa: {refertoError}
        </p>
      ) : null}

      <div className="sticky top-14 z-[25] -mx-4 mb-4 border-b border-white/[0.08] bg-[#070B14]/95 px-4 py-3 backdrop-blur-md sm:-mx-4 sm:mb-3 sm:px-4 sm:py-2.5">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Cerca giocata, conto, bookmaker o staker..."
        />
      </div>

      <section
        className="mb-3 w-full max-w-[420px] px-0 sm:mx-auto"
        aria-labelledby="bets-analytics-heading"
      >
        <h2 id="bets-analytics-heading" className="sr-only">
          Riepilogo giocate
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-white/[0.07] bg-[#0E1525]/72 px-3 py-2.5 text-[16px] backdrop-blur-sm sm:gap-y-1 sm:px-3 sm:py-2 sm:text-sm">
          <span className="text-[#94a3b8]">
            Giocate{" "}
            <strong className="whitespace-nowrap tabular-nums text-[#E6EAF2]">
              {new Intl.NumberFormat("it-IT").format(stats.count)}
            </strong>
          </span>
          <span className="text-[#475569]" aria-hidden>
            ·
          </span>
          <span className="text-[#94a3b8]">
            Profit{" "}
            <strong
              className={`whitespace-nowrap tabular-nums ${headerProfitClass(stats.totalProfit)}`}
            >
              {formatSignedProfitEuro(stats.totalProfit)}
            </strong>
          </span>
          <span className="text-[#475569]" aria-hidden>
            ·
          </span>
          <span className="text-[#94a3b8]">
            ROI{" "}
            <strong className={`whitespace-nowrap tabular-nums ${roiTextClass}`}>{roiStr}</strong>
          </span>
        </div>
      </section>

      <section
        className="mb-6 w-full max-w-[420px] px-0 sm:mx-auto"
        aria-labelledby="bets-list-heading"
      >
        <h2
          id="bets-list-heading"
          className="mb-3 text-[26px] font-bold uppercase tracking-[0.12em] text-[#64748b] sm:mb-2 sm:text-2xl sm:font-semibold sm:tracking-[0.14em]"
        >
          Timeline
        </h2>
        {accounts.length > 0 ? (
          <div className="mb-3">
            <FilterChips
              items={accountFilterChips}
              value={filterAccountId}
              onChange={(v) => setFilterAccountId(v)}
            />
          </div>
        ) : null}
        {bets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/[0.08] bg-[#0E1525]/50 px-3 py-8 text-center text-sm sm:text-xs text-[#94a3b8]">
            Nessuna giocata. Tocca + per aggiungerne una.
          </p>
        ) : filteredBets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/[0.08] bg-[#0E1525]/50 px-3 py-10 text-center text-sm sm:text-xs text-[#64748b]">
            Nessun risultato
          </p>
        ) : (
          <div className="space-y-10 sm:space-y-8">
            {betGroups.map((month) => (
              <section
                key={month.monthKey}
                className="space-y-6 sm:space-y-5"
                aria-labelledby={`bet-month-${month.monthKey}`}
              >
                <header className="flex items-end justify-between gap-2 border-b border-white/10 pb-3 sm:pb-2">
                  <h3
                    id={`bet-month-${month.monthKey}`}
                    className="text-[20px] font-bold capitalize tracking-tight text-[#E6EAF2] sm:text-xl"
                  >
                    {month.monthTitle}
                  </h3>
                  <p
                    className={`shrink-0 whitespace-nowrap text-[28px] font-extrabold tabular-nums sm:text-2xl sm:font-bold ${headerProfitClass(month.profitTotal)}`}
                  >
                    {formatSignedProfitEuro(month.profitTotal)}
                  </p>
                </header>

                {month.days.map((day) => (
                  <div key={day.dayKey} className="space-y-4 sm:space-y-3">
                    <div className="flex items-baseline justify-between gap-2 border-l-2 border-emerald-500/35 pl-3 sm:pl-2">
                      <h4 className="text-[14px] font-bold uppercase tracking-wide text-[#94a3b8] sm:text-lg">
                        {day.dayTitle}
                      </h4>
                      <p
                        className={`shrink-0 whitespace-nowrap text-[20px] font-extrabold tabular-nums sm:text-xl sm:font-bold ${headerProfitClass(day.profitTotal)}`}
                      >
                        {formatSignedProfitEuro(day.profitTotal)}
                      </p>
                    </div>
                    <ul className="flex flex-col gap-4 sm:gap-3">
                      {day.bets.map((b) => (
                        <li key={b.id}>
                          <BetTimelineCard
                            bet={b}
                            settling={settlingBetId === b.id}
                            flash={
                              betFlash?.id === b.id ? betFlash.kind : null
                            }
                            onOpenDetail={openBetDetail}
                            onOpenQuickStatus={(bet) => {
                              setEditingBet(null);
                              setStatusSheetBet(bet);
                            }}
                            onSwipeWin={swipeMarkWon}
                            onSwipeLoss={swipeMarkLost}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </section>

      <BottomSheet
        open={nuovaOpen}
        title="Nuova giocata"
        onClose={() => {
          setNuovaOpen(false);
          router.replace("/bets", { scroll: false });
        }}
        dismissDisabled={submitting}
      >
        <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm sm:text-xs uppercase tracking-wide text-[#94a3b8]">
                Conto
              </label>
              <select
                required
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
              >
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name}
                    {gamingAccountBookmakerDisplay(a)
                      ? ` · ${gamingAccountBookmakerDisplay(a)}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm sm:text-xs uppercase tracking-wide text-[#94a3b8]">
                Staker
              </label>
              <select
                required
                value={stakerId}
                onChange={(e) => setStakerId(e.target.value)}
                className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
              >
                <option value="">—</option>
                {stakers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="event_name"
              className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
            >
              Nome evento
            </label>
            <input
              id="event_name"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              required
              className="sm-input"
              placeholder="Es. Inter — Juve 1X2"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
                Quota
              </label>
              <input
                value={oddsStr}
                onChange={(e) => setOddsStr(e.target.value)}
                required
                inputMode="decimal"
                className="sm-input"
                placeholder="2,50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
                Stake (€)
              </label>
              <input
                value={stakeStr}
                onChange={(e) => setStakeStr(e.target.value)}
                required
                inputMode="decimal"
                className="sm-input"
                placeholder="10"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
                Stato
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BetStatus)}
                className="sm-input"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!Number.isNaN(oddsNum) &&
          oddsNum > 0 &&
          !Number.isNaN(stakeNum) &&
          stakeNum > 0 ? (
            <p className="text-sm sm:text-xs text-[#94a3b8]">
              Profit{" "}
              <span className={`font-semibold tabular-nums ${profitPreviewClass}`}>
                {formatMoney(previewProfit)} €
              </span>
            </p>
          ) : null}

          {newBetStakeExceedsBalance && !formError ? (
            <p
              className="rounded-lg border border-[#fb7185]/35 bg-[#fb7185]/10 px-2.5 py-1.5 text-sm sm:text-xs text-[#fb7185]"
              role="status"
            >
              Saldo conto insufficiente
            </p>
          ) : null}

          {formError ? (
            <p
              className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-lg sm:text-sm text-[#fb7185]"
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || newBetStakeExceedsBalance}
            className="sm-btn-primary w-full rounded-full disabled:cursor-not-allowed disabled:opacity-45"
          >
            {submitting ? "Salvataggio…" : "Salva giocata"}
          </button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={editingBet !== null}
        title="Dettaglio giocata"
        dismissDisabled={
          editSaving ||
          (editingBet != null && settlingBetId === editingBet.id)
        }
        onClose={() => {
          if (!editSaving && !(editingBet && settlingBetId === editingBet.id)) {
            setEditingBet(null);
          }
        }}
      >
        <form className="space-y-3" onSubmit={(e) => void handleSaveBetEdit(e)}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="bet-detail-account"
                className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#64748b]"
              >
                Conto
              </label>
              <select
                id="bet-detail-account"
                required
                value={editGamingAccountId}
                onChange={(e) => setEditGamingAccountId(e.target.value)}
                className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
              >
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name}
                    {gamingAccountBookmakerDisplay(a)
                      ? ` · ${gamingAccountBookmakerDisplay(a)}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label
                htmlFor="bet-detail-staker"
                className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#64748b]"
              >
                Staker
              </label>
              <select
                id="bet-detail-staker"
                required
                value={editStakerId}
                onChange={(e) => setEditStakerId(e.target.value)}
                className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
              >
                <option value="">—</option>
                {stakers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="bet-detail-event"
              className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#64748b]"
            >
              Nome evento
            </label>
            <input
              id="bet-detail-event"
              value={editEventName}
              onChange={(e) => setEditEventName(e.target.value)}
              required
              className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <label
                htmlFor="bet-detail-odds"
                className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#64748b]"
              >
                Quota
              </label>
              <input
                id="bet-detail-odds"
                value={editOddsStr}
                onChange={(e) => setEditOddsStr(e.target.value)}
                required
                inputMode="decimal"
                className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="bet-detail-stake"
                className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#64748b]"
              >
                Stake (€)
              </label>
              <input
                id="bet-detail-stake"
                value={editStakeStr}
                onChange={(e) => setEditStakeStr(e.target.value)}
                required
                inputMode="decimal"
                className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
              />
            </div>
            <div className="space-y-1 sm:col-span-1">
              <label
                htmlFor="bet-detail-status"
                className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#64748b]"
              >
                Stato
              </label>
              <select
                id="bet-detail-status"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as BetStatus)}
                className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="bet-detail-note"
              className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#64748b]"
            >
              Note (opzionale)
            </label>
            <textarea
              id="bet-detail-note"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={2}
              className="sm-input min-h-[4rem] resize-y text-lg sm:text-sm"
            />
          </div>

          {editError ? (
            <p
              className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-lg sm:text-sm text-[#fb7185]"
              role="alert"
            >
              {editError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={editSaving || settlingBetId === editingBet?.id}
            className="sm-btn-primary mt-1 w-full min-h-12 rounded-2xl disabled:opacity-60"
          >
            {editSaving ? "Salvataggio…" : "Salva modifiche"}
          </button>
          <button
            type="button"
            disabled={editSaving || settlingBetId === editingBet?.id}
            className="min-h-12 w-full rounded-2xl border border-red-500/50 bg-red-600/10 text-lg sm:text-sm font-bold text-red-200 transition hover:bg-red-600/20 active:scale-[0.99] disabled:opacity-50"
            onClick={() => {
              if (!editingBet) return;
              const b = editingBet;
              setEditingBet(null);
              setDeleteBetError(null);
              setDeleteBetTarget(b);
            }}
          >
            Elimina giocata
          </button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={statusSheetBet !== null}
        title="Stato rapido"
        dismissDisabled={
          statusSheetBet != null && settlingBetId === statusSheetBet.id
        }
        onClose={() => setStatusSheetBet(null)}
      >
        {statusSheetBet
          ? (() => {
              const sb = statusSheetBet;
              const stakeN = Number.parseFloat(String(sb.stake).replace(",", "."));
              const oddsN = Number.parseFloat(String(sb.odds).replace(",", "."));
              const headerProfit = computeProfit(sb.status, stakeN, oddsN);
              const headerProfitClass =
                headerProfit > 0
                  ? "text-[#34d399]"
                  : headerProfit < 0
                    ? "text-[#fb7185]"
                    : "text-[#94a3b8]";
              const settlingThis = settlingBetId === sb.id;
              return (
                <div className="space-y-4">
                  <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#0E1525]/80 px-3 py-3">
                    <p className="line-clamp-2 text-lg sm:text-sm font-semibold leading-snug text-white">
                      {sb.event_name?.trim() || "—"}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm sm:text-xs text-[#94a3b8]">
                      <span>
                        Stake{" "}
                        <span className="font-semibold tabular-nums text-white">
                          {formatMoney(sb.stake)} €
                        </span>
                      </span>
                      <span>
                        Quota{" "}
                        <span className="font-semibold tabular-nums text-white">
                          {formatMoney(sb.odds)}
                        </span>
                      </span>
                    </div>
                    <p className="text-sm sm:text-xs text-[#94a3b8]">
                      Profit previsto{" "}
                      <span className={`font-bold tabular-nums ${headerProfitClass}`}>
                        {formatSignedProfitEuro(headerProfit)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {STATUS_SHEET_OPTIONS.map(({ status: st, label, sheetButtonClass }) => {
                      const rowProfit = computeProfit(st, stakeN, oddsN);
                      const rowCls =
                        rowProfit > 0
                          ? "text-emerald-200/90"
                          : rowProfit < 0
                            ? "text-red-200/90"
                            : "text-slate-300/90";
                      return (
                        <button
                          key={st}
                          type="button"
                          disabled={settlingThis}
                          className={`flex min-h-14 w-full flex-col items-stretch justify-center rounded-2xl px-4 py-3 text-left text-lg sm:text-base font-bold transition disabled:opacity-50 ${sheetButtonClass}`}
                          onClick={() => {
                            setStatusSheetBet(null);
                            if (sb.status === st) return;
                            void handleBetStatusChange(sb, st);
                          }}
                        >
                          <span>{label}</span>
                          <span
                            className={`mt-0.5 text-sm sm:text-xs font-semibold tabular-nums ${rowCls}`}
                          >
                            {formatSignedProfitEuro(rowProfit)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          : null}
      </BottomSheet>

      <ConfirmDialog
        open={deleteBetTarget !== null}
        title="Eliminare questa scommessa?"
        message={
          deleteBetTarget
            ? `«${deleteBetTarget.event_name || "evento"}»`
            : ""
        }
        confirmText="Elimina"
        variant="danger"
        loading={deleteBetLoading}
        error={deleteBetError}
        onCancel={() => {
          if (!deleteBetLoading) {
            setDeleteBetError(null);
            setDeleteBetTarget(null);
          }
        }}
        onConfirm={async () => {
          await handleConfirmDeleteBet();
        }}
      />
    </AppShell>
  );
}

export default function BetsPage() {
  return (
    <AuthGate>
      <Suspense
        fallback={
          <AppShell title="Giocate">
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-lg sm:text-sm text-[#94a3b8]">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-white/[0.12] border-t-[#a855f7]/45"
                aria-hidden
              />
              <p>Caricamento…</p>
            </div>
          </AppShell>
        }
      >
        <BetsPageContent />
      </Suspense>
    </AuthGate>
  );
}
