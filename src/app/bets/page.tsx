"use client";

import { BottomSheet, FilterChips, SearchInput } from "@/components/app";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BET_TYPE_DEFAULT } from "@/lib/bet-constants";
import { betBalanceContributionDelta, betSettledPnL } from "@/lib/bet-balance-effect";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import { assertGamingAccountCoversStake } from "@/lib/balance-validation";
import {
  betExists,
  deleteBetById,
  fetchBetsPage,
  fetchGamingAccountBalances,
  fetchUserBetsSettledStatsWithFallback,
  insertBet,
  type BetListRow,
  type BetsSettledStats,
  updateBetById,
  updateBetStatusOnly,
} from "@/lib/repositories/bets-repository";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { formatClientError } from "@/lib/user-message";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, memo } from "react";

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

type BetRow = BetListRow;

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

const BETS_PAGE_SIZE = 50;

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
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
  const out: BetsMonthGroup[] = [];

  for (const mk of monthKeys) {
    const bucket = months.get(mk)!;
    const dayKeys = [...bucket.days.keys()].sort((a, b) => b.localeCompare(a));
    const days: BetsDayGroup[] = dayKeys.map((dk) => {
      const { bets: dayBets, sample } = bucket.days.get(dk)!;
      const profitTotal = dayBets.reduce(
        (s, x) =>
          s + betSettledPnL(x.status, x.stake, x.odds, x.profit),
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
  return "text-[#8B93A7]";
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
          "border-emerald-500/45 bg-emerald-500/15 text-emerald-300 max-sm:shadow-none sm:shadow-sm",
      };
    case "lost":
      return {
        label: "PERSA",
        className:
          "border-red-500/45 bg-red-500/12 text-red-200 max-sm:shadow-none sm:shadow-sm",
      };
    case "open":
      return {
        label: "APERTA",
        className: "border-white/[0.12] bg-white/[0.06] text-[#B4BCCC]",
      };
    case "void":
      return {
        label: "PUSH",
        className:
          "border-sky-500/45 bg-sky-600/20 text-sky-200 max-sm:shadow-none sm:shadow-sm",
      };
    default:
      return {
        label: "CASH",
        className:
          "border-amber-500/40 bg-amber-500/10 text-amber-200 max-sm:shadow-none sm:shadow-sm",
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
      <span className="inline-flex h-7 min-w-[3.25rem] items-center justify-center rounded border border-white/10 bg-white/5 px-1.5 sm:h-7 sm:min-w-[3.5rem]">
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white/90"
          aria-hidden
        />
      </span>
    );
  }
  const t = tradeStatusDisplay(status);
  return (
    <span
      className={`inline-flex min-h-0 shrink-0 items-center justify-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-[0.1em] transition-colors duration-500 sm:px-2 sm:py-0.5 sm:text-xs sm:tracking-wide ${t.className}`}
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

const BetTimelineCard = memo(function BetTimelineCard({
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
  const pnl = betSettledPnL(b.status, b.stake, b.odds, b.profit);
  const profitClass =
    pnl > 0
      ? "text-[#34d399]"
      : pnl < 0
        ? "text-[#fb7185]"
        : "text-[#8B93A7]";
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
      className={`relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#12192A]/92 max-sm:backdrop-blur-none sm:bg-[#11182B]/78 sm:backdrop-blur-sm max-sm:shadow-none sm:shadow-sm transition-[transform,opacity,border-color] duration-200 ease-out select-none max-sm:hover:scale-100 sm:hover:border-emerald-500/20 sm:hover:shadow-[0_0_6px_rgba(52,211,153,0.03)] sm:hover:scale-[1.005] active:scale-[0.97] sm:rounded-xl ${flashClass} ${
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
      <div className="flex min-w-0 flex-col gap-1 px-2 py-2 sm:gap-1.5 sm:px-2.5 sm:py-2">
        <div className="flex items-center justify-between gap-2">
          <time
            dateTime={b.placed_at}
            className="shrink-0 text-[11px] font-semibold tabular-nums leading-none text-[#8B93A7] sm:text-sm sm:leading-normal"
          >
            {timeStr}
          </time>
          <BetStatusBadge status={b.status} settling={settling} />
        </div>
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[#E6EAF2] sm:text-xl sm:font-semibold sm:leading-snug">
          {b.event_name?.trim() || "—"}
        </h3>
        <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[#8B93A7] sm:text-sm sm:tracking-wide">
          {bookmakerAccountSmall(b)}
        </p>
        <p className="text-xs leading-snug text-[#8B93A7] sm:text-sm sm:leading-normal">
          <span className="whitespace-nowrap font-semibold tabular-nums text-[#E6EAF2]">
            {formatMoney(b.stake)} €
          </span>
          <span className="mx-1 text-[#6B7385]">·</span>
          <span>
            quota{" "}
            <span className="whitespace-nowrap font-semibold tabular-nums text-[#E6EAF2]">{formatMoney(b.odds)}</span>
          </span>
        </p>
        {showResult ? (
          <p className={`whitespace-nowrap text-lg font-bold tabular-nums leading-none sm:text-2xl sm:font-bold ${profitClass}`}>
            {pnl > 0 ? "+" : ""}
            {formatMoney(pnl)} €
          </p>
        ) : null}
      </div>
    </article>
  );
});
BetTimelineCard.displayName = "BetTimelineCard";

function BetsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [ready, setReady] = useState(false);
  const [stakers, setStakers] = useState<StakerRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [bets, setBets] = useState<BetRow[]>([]);
  const [rollup, setRollup] = useState<BetsSettledStats | null>(null);
  const [betsHasMore, setBetsHasMore] = useState(true);
  const [betsLoadingMore, setBetsLoadingMore] = useState(false);
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
      setLoadError(
        formatClientError(sRes.error ?? aRes.error ?? "Errore caricamento", "Errore caricamento."),
      );
      return;
    }
    setStakers((sRes.data as StakerRow[]) ?? []);
    setAccounts((aRes.data as AccountRow[]) ?? []);
  }, [supabase]);

  const loadRollup = useCallback(async () => {
    const res = await fetchUserBetsSettledStatsWithFallback(supabase);
    if (!res.ok) {
      setRollup(null);
      return;
    }
    setRollup(res.stats);
  }, [supabase]);

  const mergeAccountBalances = useCallback(async () => {
    const res = await fetchGamingAccountBalances(supabase);
    if (!res.ok) return;
    setAccounts((prev) =>
      prev.map((a) => {
        const hit = res.rows.find((r) => r.id === a.id);
        return hit ? { ...a, current_balance: hit.current_balance } : a;
      }),
    );
  }, [supabase]);

  const loadBetsReset = useCallback(async () => {
    const res = await fetchBetsPage(supabase, { limit: BETS_PAGE_SIZE, offset: 0 });
    if (!res.ok) {
      setLoadError(res.message);
      setBets([]);
      setBetsHasMore(false);
      return;
    }
    setBets(res.rows);
    setBetsHasMore(res.rows.length === BETS_PAGE_SIZE);
  }, [supabase]);

  const loadBetsAppend = useCallback(async () => {
    if (betsLoadingMore || !betsHasMore) return;
    setBetsLoadingMore(true);
    const offset = bets.length;
    const res = await fetchBetsPage(supabase, { limit: BETS_PAGE_SIZE, offset });
    if (!res.ok) {
      setLoadError(res.message);
      setBetsLoadingMore(false);
      return;
    }
    setBets((prev) => [...prev, ...res.rows]);
    setBetsHasMore(res.rows.length === BETS_PAGE_SIZE);
    setBetsLoadingMore(false);
  }, [bets.length, betsHasMore, betsLoadingMore, supabase]);

  const loadAll = useCallback(async () => {
    await loadRefs();
    await Promise.all([loadBetsReset(), loadRollup()]);
  }, [loadBetsReset, loadRefs, loadRollup]);

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

  const betsRef = useRef(bets);
  const accountsRef = useRef(accounts);
  useEffect(() => {
    betsRef.current = bets;
  }, [bets]);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  const stats = useMemo(() => {
    if (rollup) {
      return {
        count: rollup.total_bets,
        totalStake: rollup.settled_stake,
        totalProfit: rollup.settled_pnl,
      };
    }
    return { count: 0, totalStake: 0, totalProfit: 0 };
  }, [rollup]);

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
        : "text-[#8B93A7]";

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

    const profit = betSettledPnL(status, stakeNum, oddsNum, 0);

    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      setFormError("Sessione non valida. Accedi di nuovo.");
      return;
    }

    const betType = formBetType.trim() || BET_TYPE_DEFAULT;

    const ins = await insertBet(supabase, {
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
    if (!ins.ok) {
      setFormError(ins.message);
      return;
    }

    setBets((prev) => [ins.bet, ...prev]);
    void loadRollup();
    void mergeAccountBalances();

    setEventName("");
    setOddsStr("");
    setStakeStr("");
    setStatus("open");
    setFormBetType(BET_TYPE_DEFAULT);
    setNuovaOpen(false);
    router.replace("/bets", { scroll: false });
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

    const exists = await betExists(supabase, editingBet.id);
    if (!exists.ok) {
      setEditError(exists.message);
      setEditSaving(false);
      return;
    }
    if (!exists.exists) {
      setEditError("Scommessa non trovata.");
      setEditSaving(false);
      return;
    }

    const cashProfit =
      editStatus === "cashout"
        ? Number.parseFloat(String(editingBet.profit).replace(",", ".")) || 0
        : 0;
    const newProfit = betSettledPnL(editStatus, stakeNum, oddsNum, cashProfit);
    const settled_at = editStatus === "open" ? null : new Date().toISOString();
    const noteVal = editNote.trim() ? editNote.trim() : null;

    const prevBets = bets;
    const predictedProfitStr = String(newProfit);
    const predicted: BetRow = {
      ...editingBet,
      gaming_account_id: editGamingAccountId,
      staker_id: editStakerId,
      player_id: accPick.player_id,
      event_name: ev,
      odds: String(oddsNum),
      stake: String(stakeNum),
      status: editStatus,
      profit: predictedProfitStr,
      settled_at,
      bet_type: betType,
      note: noteVal,
    };

    setBets((list) => list.map((b) => (b.id === editingBet.id ? predicted : b)));

    const res = await updateBetById(supabase, editingBet.id, {
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
    });

    if (!res.ok) {
      setBets(prevBets);
      setEditError(res.message);
      setEditSaving(false);
      return;
    }

    setBets((list) => list.map((b) => (b.id === editingBet.id ? res.bet : b)));
    setEditSaving(false);
    setEditingBet(null);
    void loadRollup();
    void mergeAccountBalances();
  }

  async function handleConfirmDeleteBet() {
    if (!deleteBetTarget) return;
    setDeleteBetError(null);
    setDeleteBetLoading(true);
    const id = deleteBetTarget.id;
    const prevBets = bets;
    setBets((list) => list.filter((b) => b.id !== id));
    const res = await deleteBetById(supabase, id);
    setDeleteBetLoading(false);
    if (!res.ok) {
      setBets(prevBets);
      setDeleteBetError(res.message);
      return;
    }
    setDeleteBetTarget(null);
    void loadRollup();
    void mergeAccountBalances();
  }

  const handleBetStatusChange = useCallback(
    async (bet: BetRow, newStatus: LinguettaBetStatus) => {
      if (bet.status === newStatus) return;

      setRefertoError(null);
      setSettlingBetId(bet.id);

      const { data: row, error: fetchErr } = await supabase
        .from("bets")
        .select(
          "id, status, profit, stake, odds, settled_at, gaming_account_id, player_id, staker_id",
        )
        .eq("id", bet.id)
        .maybeSingle();

      if (fetchErr) {
        setRefertoError(formatClientError(fetchErr));
        setSettlingBetId(null);
        return;
      }
      if (!row) {
        setRefertoError("Scommessa non trovata.");
        setSettlingBetId(null);
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

      if (r.status === newStatus) {
        setSettlingBetId(null);
        return;
      }

      const stake = Number.parseFloat(String(r.stake).replace(",", "."));
      const odds = Number.parseFloat(String(r.odds).replace(",", "."));

      if (Number.isNaN(stake) || stake <= 0) {
        setRefertoError("Stake non valido per aggiornare lo stato.");
        setSettlingBetId(null);
        return;
      }
      if (newStatus === "won" && (Number.isNaN(odds) || odds <= 0)) {
        setRefertoError("Quota non valida per lo stato Vinto.");
        setSettlingBetId(null);
        return;
      }

      const profitForUpdate = betSettledPnL(newStatus, stake, odds, 0);
      const settled_at = newStatus === "open" ? null : new Date().toISOString();

      const before = {
        status: r.status,
        stake: r.stake,
        odds: r.odds,
        profit: r.profit,
      };
      const after = {
        status: newStatus,
        stake: r.stake,
        odds: r.odds,
        profit: String(profitForUpdate),
      };
      const delta = betBalanceContributionDelta(before, after);

      const prevBets = betsRef.current.slice();
      const prevAccounts = accountsRef.current.map((a) => ({ ...a }));

      setBets((list) =>
        list.map((b) =>
          b.id === bet.id
            ? {
                ...b,
                status: newStatus,
                profit: String(profitForUpdate),
                settled_at,
              }
            : b,
        ),
      );
      if (delta !== 0) {
        setAccounts((prev) =>
          prev.map((a) => {
            if (a.id !== r.gaming_account_id) return a;
            const cur = Number.parseFloat(a.current_balance) || 0;
            const next = Math.round((cur + delta) * 1e4) / 1e4;
            return { ...a, current_balance: String(next) };
          }),
        );
      }

      const upd = await updateBetStatusOnly(supabase, r.id, {
        status: newStatus,
        profit: profitForUpdate,
        settled_at,
      });

      if (!upd.ok) {
        setBets(prevBets);
        setAccounts(prevAccounts);
        setRefertoError(upd.message);
        setSettlingBetId(null);
        return;
      }

      void loadRollup();
      void mergeAccountBalances();

      if (profitForUpdate > 0) {
        setBetFlash({ id: bet.id, kind: "profit" });
        window.setTimeout(() => {
          setBetFlash((f) => (f?.id === bet.id ? null : f));
        }, 900);
      } else if (profitForUpdate < 0) {
        setBetFlash({ id: bet.id, kind: "loss" });
        window.setTimeout(() => {
          setBetFlash((f) => (f?.id === bet.id ? null : f));
        }, 900);
      } else {
        setBetFlash((f) => (f?.id === bet.id ? null : f));
      }

      setSettlingBetId(null);
    },
    [loadRollup, mergeAccountBalances, supabase],
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
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-lg sm:text-sm text-[#8B93A7]">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-white/[0.12] border-t-[#A970FF]/45"
            aria-hidden
          />
          <p>Caricamento…</p>
        </div>
      </AppShell>
    );
  }

  const previewProfit = betSettledPnL(status, stakeNum, oddsNum, 0);
  const profitPreviewClass =
    previewProfit > 0
      ? "text-[#34d399]"
      : previewProfit < 0
        ? "text-[#fb7185]"
        : "text-[#8B93A7]";

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

      <div className="sticky top-12 z-[25] -mx-2.5 mb-2 border-b border-white/[0.06] bg-[#0B1224]/96 px-2.5 py-1.5 max-sm:backdrop-blur-none sm:top-14 sm:-mx-4 sm:mb-3 sm:px-4 sm:py-2.5 sm:backdrop-blur-md">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Cerca giocata, conto, bookmaker o staker..."
        />
      </div>

      <section
        className="mb-2 w-full max-w-[420px] px-0 sm:mx-auto sm:mb-3"
        aria-labelledby="bets-analytics-heading"
      >
        <h2 id="bets-analytics-heading" className="sr-only">
          Riepilogo giocate
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-2xl border border-white/[0.06] bg-[#12192A]/92 px-2.5 py-2 text-xs leading-snug max-sm:backdrop-blur-none sm:gap-x-4 sm:gap-y-1 sm:rounded-xl sm:bg-[#11182B]/72 sm:px-3 sm:py-2 sm:text-sm sm:leading-normal sm:backdrop-blur-sm">
          <span className="text-[#8B93A7]">
            Giocate{" "}
            <strong className="whitespace-nowrap tabular-nums text-[#E6EAF2]">
              {new Intl.NumberFormat("it-IT").format(stats.count)}
            </strong>
          </span>
          <span className="text-[#6B7385]" aria-hidden>
            ·
          </span>
          <span className="text-[#8B93A7]">
            Profit{" "}
            <strong
              className={`whitespace-nowrap tabular-nums ${headerProfitClass(stats.totalProfit)}`}
            >
              {formatSignedProfitEuro(stats.totalProfit)}
            </strong>
          </span>
          <span className="text-[#6B7385]" aria-hidden>
            ·
          </span>
          <span className="text-[#8B93A7]">
            ROI{" "}
            <strong className={`whitespace-nowrap tabular-nums ${roiTextClass}`}>{roiStr}</strong>
          </span>
        </div>
      </section>

      <section
        className="mb-3 w-full max-w-[420px] px-0 sm:mx-auto sm:mb-4"
        aria-labelledby="bets-list-heading"
      >
        <h2
          id="bets-list-heading"
          className="mb-1.5 text-xl font-bold uppercase tracking-[0.1em] text-[#8B93A7] sm:mb-2 sm:text-2xl sm:font-semibold sm:tracking-[0.14em]"
        >
          Timeline
        </h2>
        {accounts.length > 0 ? (
          <div className="mb-1.5">
            <FilterChips
              items={accountFilterChips}
              value={filterAccountId}
              onChange={(v) => setFilterAccountId(v)}
            />
          </div>
        ) : null}
        {bets.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/[0.06] bg-[#11182B]/50 px-2.5 py-6 text-center text-xs sm:rounded-xl sm:px-3 sm:py-8 sm:text-xs">
            Nessuna giocata. Tocca + per aggiungerne una.
          </p>
        ) : filteredBets.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/[0.06] bg-[#11182B]/50 px-2.5 py-7 text-center text-xs sm:rounded-xl sm:px-3 sm:py-10 sm:text-xs">
            Nessun risultato
          </p>
        ) : (
          <div className="space-y-3 sm:space-y-8">
            {betGroups.map((month) => (
              <section
                key={month.monthKey}
                className="space-y-2 sm:space-y-5"
                aria-labelledby={`bet-month-${month.monthKey}`}
              >
                <header className="flex items-end justify-between gap-2 border-b border-white/10 pb-1 sm:pb-2">
                  <h3
                    id={`bet-month-${month.monthKey}`}
                    className="text-base font-bold capitalize leading-tight tracking-tight text-[#E6EAF2] sm:text-xl"
                  >
                    {month.monthTitle}
                  </h3>
                  <p
                    className={`shrink-0 whitespace-nowrap text-lg font-bold tabular-nums sm:text-2xl sm:font-bold ${headerProfitClass(month.profitTotal)}`}
                  >
                    {formatSignedProfitEuro(month.profitTotal)}
                  </p>
                </header>

                {month.days.map((day) => (
                  <div key={day.dayKey} className="space-y-1.5 sm:space-y-3">
                    <div className="flex items-baseline justify-between gap-2 border-l-2 border-emerald-500/35 pl-2 sm:pl-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#8B93A7] sm:text-lg sm:font-semibold">
                        {day.dayTitle}
                      </h4>
                      <p
                        className={`shrink-0 whitespace-nowrap text-sm font-bold tabular-nums sm:text-xl sm:font-bold ${headerProfitClass(day.profitTotal)}`}
                      >
                        {formatSignedProfitEuro(day.profitTotal)}
                      </p>
                    </div>
                    <ul className="flex flex-col gap-1.5 sm:gap-3">
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
            {betsHasMore && !filterAccountId && !searchQuery.trim() ? (
              <div className="flex justify-center pt-1 sm:pt-2">
                <button
                  type="button"
                  onClick={() => void loadBetsAppend()}
                  disabled={betsLoadingMore}
                  className="sm-touch min-h-11 w-full max-w-xs rounded-full border border-white/[0.08] bg-[#131C31] px-4 text-sm font-semibold text-[#E6EAF2] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10 sm:text-xs"
                >
                  {betsLoadingMore ? "Caricamento…" : "Carica altre giocate"}
                </button>
              </div>
            ) : null}
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
        <form onSubmit={(e) => void handleSave(e)} className="space-y-2 sm:space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm sm:text-xs uppercase tracking-wide text-[#8B93A7]">
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
              <label className="text-sm sm:text-xs uppercase tracking-wide text-[#8B93A7]">
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
              className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#8B93A7]"
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
              <label className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#8B93A7]">
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
              <label className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#8B93A7]">
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
              <label className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#8B93A7]">
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
            <p className="text-sm sm:text-xs text-[#8B93A7]">
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
        <form className="space-y-2 sm:space-y-3" onSubmit={(e) => void handleSaveBetEdit(e)}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="bet-detail-account"
                className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]"
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
                className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]"
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
              className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]"
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
                className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]"
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
                className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]"
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
                className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]"
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
              className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]"
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
              const headerProfit = betSettledPnL(
                sb.status,
                stakeN,
                oddsN,
                sb.status === "cashout"
                  ? Number.parseFloat(String(sb.profit).replace(",", ".")) || 0
                  : 0,
              );
              const headerProfitClass =
                headerProfit > 0
                  ? "text-[#34d399]"
                  : headerProfit < 0
                    ? "text-[#fb7185]"
                    : "text-[#8B93A7]";
              const settlingThis = settlingBetId === sb.id;
              return (
                <div className="space-y-4">
                  <div className="space-y-2 rounded-xl border border-white/[0.06] bg-[#11182B]/80 px-3 py-3">
                    <p className="line-clamp-2 text-lg sm:text-sm font-semibold leading-snug text-white">
                      {sb.event_name?.trim() || "—"}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm sm:text-xs text-[#8B93A7]">
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
                    <p className="text-sm sm:text-xs text-[#8B93A7]">
                      Profit previsto{" "}
                      <span className={`font-bold tabular-nums ${headerProfitClass}`}>
                        {formatSignedProfitEuro(headerProfit)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {STATUS_SHEET_OPTIONS.map(({ status: st, label, sheetButtonClass }) => {
                      const rowProfit = betSettledPnL(st, stakeN, oddsN, 0);
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
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-lg sm:text-sm text-[#8B93A7]">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-white/[0.12] border-t-[#A970FF]/45"
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
