"use client";

import { BottomSheet, SearchInput } from "@/components/app";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import { paymentMethodTitle } from "@/lib/payment-methods";
import { applyWithdrawalStatusChange } from "@/lib/withdrawal-status-client";
import { WITHDRAWAL_STATUS_SELECT_OPTIONS } from "@/lib/withdrawal-status-delta";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  isTransactionStatus,
  transactionStatusLabel,
  type TransactionStatus,
} from "@/lib/transaction-status";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type TxType = "deposit" | "withdrawal";

type PlayerRow = { id: string; name: string };

type GamingAccountRow = {
  id: string;
  player_id: string;
  account_name: string;
  bookmaker: string;
  bookmaker_id: string | null;
  bookmakers: { name: string } | { name: string }[] | null;
};

type PaymentMethodRow = {
  id: string;
  label: string | null;
  method_name: string;
  type: string | null;
  player_id: string;
};

/** Riga transazione senza join (solo FK). */
type TxRow = {
  id: string;
  type: TxType;
  amount: string | number;
  status: string;
  created_at: string;
  note: string | null;
  gaming_account_id: string;
  payment_method_id: string;
  player_id: string;
};

type PeriodPreset = "today" | "7d" | "30d" | "month" | "all" | "custom";

const STATUS_OPTIONS: { value: TransactionStatus | "all"; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "completed", label: "Completato" },
  { value: "pending", label: "In attesa" },
  { value: "rejected", label: "Rifiutato" },
  { value: "cancelled", label: "Annullato" },
];

const TYPE_OPTIONS: { value: TxType | "all"; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "deposit", label: "Deposito" },
  { value: "withdrawal", label: "Prelievo" },
];

type TxDayGroup = {
  dayKey: string;
  dayTitle: string;
  dayTotal: number;
  items: TxRow[];
};

type TxMonthGroup = {
  monthKey: string;
  monthTitle: string;
  monthTotal: number;
  days: TxDayGroup[];
};

function capitalizeFirst(s: string): string {
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
  return capitalizeFirst(raw);
}

function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

/** Riga lista: data breve + ora */
function formatListWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function parseAmount(s: unknown): number {
  if (s === null || s === undefined) return NaN;
  if (typeof s === "number") return Number.isFinite(s) ? s : NaN;
  if (typeof s === "string") {
    const n = Number.parseFloat(s.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function signedFlowAmount(t: TxRow): number {
  const a = parseAmount(t.amount);
  if (Number.isNaN(a)) return 0;
  return t.type === "deposit" ? a : -a;
}

function groupTxByMonthDay(rows: TxRow[]): TxMonthGroup[] {
  type DayBucket = { items: TxRow[]; sample: Date };
  type MonthBucket = { days: Map<string, DayBucket>; monthTotal: number };

  const months = new Map<string, MonthBucket>();

  for (const t of rows) {
    const d = new Date(t.created_at);
    const y = d.getFullYear();
    const mo = d.getMonth();
    const dayNum = d.getDate();
    const monthKey = `${y}-${String(mo + 1).padStart(2, "0")}`;
    const dayKey = `${monthKey}-${String(dayNum).padStart(2, "0")}`;
    const s = signedFlowAmount(t);

    if (!months.has(monthKey)) {
      months.set(monthKey, { days: new Map(), monthTotal: 0 });
    }
    const mb = months.get(monthKey)!;
    mb.monthTotal += s;
    if (!mb.days.has(dayKey)) {
      mb.days.set(dayKey, { items: [], sample: d });
    }
    mb.days.get(dayKey)!.items.push(t);
  }

  const monthKeys = [...months.keys()].sort((a, b) => b.localeCompare(a));
  const out: TxMonthGroup[] = [];

  for (const mk of monthKeys) {
    const mb = months.get(mk)!;
    const dayKeys = [...mb.days.keys()].sort((a, b) => b.localeCompare(a));
    const days: TxDayGroup[] = dayKeys.map((dk) => {
      const { items, sample } = mb.days.get(dk)!;
      const dayTotal = items.reduce((sum, x) => sum + signedFlowAmount(x), 0);
      return {
        dayKey: dk,
        dayTitle: capitalizeFirst(
          new Intl.DateTimeFormat("it-IT", {
            weekday: "long",
            day: "numeric",
            month: "short",
          }).format(sample),
        ),
        dayTotal,
        items,
      };
    });
    out.push({
      monthKey: mk,
      monthTitle: monthTitleFromKey(mk),
      monthTotal: mb.monthTotal,
      days,
    });
  }
  return out;
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

function toYmdFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function periodBounds(
  preset: PeriodPreset,
  customFrom: string,
  customTo: string,
): { from: string | null; to: string | null } {
  const now = new Date();
  if (preset === "all") return { from: null, to: null };
  if (preset === "custom") {
    if (!customFrom && !customTo) return { from: null, to: null };
    const from = customFrom
      ? startOfLocalDay(new Date(`${customFrom}T12:00:00`)).toISOString()
      : null;
    const to = customTo
      ? endOfLocalDay(new Date(`${customTo}T12:00:00`)).toISOString()
      : null;
    return { from, to };
  }
  if (preset === "today") {
    return {
      from: startOfLocalDay(now).toISOString(),
      to: endOfLocalDay(now).toISOString(),
    };
  }
  if (preset === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return {
      from: startOfLocalDay(start).toISOString(),
      to: endOfLocalDay(now).toISOString(),
    };
  }
  if (preset === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return {
      from: startOfLocalDay(start).toISOString(),
      to: endOfLocalDay(now).toISOString(),
    };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: startOfLocalDay(start).toISOString(),
    to: endOfLocalDay(now).toISOString(),
  };
}

function signedTotalLabel(n: number): string {
  const abs = formatMoney(Math.abs(n));
  if (n > 0) return `+${abs} €`;
  if (n < 0) return `−${abs} €`;
  return `${formatMoney(0)} €`;
}

function totalHeaderClass(n: number): string {
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-[#fb7185]";
  return "text-[#8B93A7]";
}

function txStatus(t: TxRow): TransactionStatus {
  return isTransactionStatus(t.status) ? t.status : "pending";
}

function txIsInvalid(t: TxRow): boolean {
  const s = txStatus(t);
  return s === "cancelled" || s === "rejected";
}

/** Importo riga: verde entrate, rosso uscite completate, arancio attesa, grigio annullato. */
function txAmountRowClass(t: TxRow): string {
  const st = txStatus(t);
  if (txIsInvalid(t)) return "text-[#9aa0a6]";
  if (st === "pending") return "text-[#fb923c]";
  if (st === "completed" && t.type === "withdrawal") return "text-[#ff5f5f]";
  if (st === "completed" && t.type === "deposit") return "text-emerald-400";
  return t.type === "deposit" ? "text-emerald-400" : "text-[#ff5f5f]";
}

/** Etichetta tipo (solo parte "Deposito"/"Prelievo") sulla prima riga. */
function txTypeWordClass(t: TxRow): string {
  const st = txStatus(t);
  if (txIsInvalid(t)) return "text-[#9aa0a6]";
  if (st === "pending") return "text-[#fdba74]";
  if (t.type === "deposit") return "text-emerald-400/95";
  return "text-[#f87171]";
}

/** Badge stato — palette movimenti (finanziaria). */
function movimentiStatusBadgeClass(t: TxRow): string {
  const st = txStatus(t);
  if (st === "cancelled" || st === "rejected") {
    return "border-[#3f4654] bg-[#2a2f38] text-[#9aa0a6]";
  }
  if (st === "pending") {
    return "border-amber-500/35 bg-amber-950/40 text-[#fdba74]";
  }
  if (st === "completed" && t.type === "withdrawal") {
    return "border-[#5c3838] bg-[#361f22] text-[#e8a0a0]";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
}

function txMatchesLiveSearch(
  t: TxRow,
  needle: string,
  playerMap: Map<string, PlayerRow>,
  accountMap: Map<string, GamingAccountRow>,
  methodMap: Map<string, PaymentMethodRow>,
): boolean {
  if (t.note?.toLowerCase().includes(needle)) return true;
  const idn = playerMap.get(t.player_id);
  if (idn?.name.toLowerCase().includes(needle)) return true;
  const acc = accountMap.get(t.gaming_account_id);
  const pm = methodMap.get(t.payment_method_id);
  const accStr = acc
    ? `${acc.account_name} ${gamingAccountBookmakerDisplay(acc) ?? ""}`.toLowerCase()
    : "";
  const pmStr = pm
    ? paymentMethodTitle({
        label: pm.label,
        method_name: pm.method_name,
        type: pm.type,
      }).toLowerCase()
    : "";
  if (accStr.includes(needle) || pmStr.includes(needle)) return true;

  if (
    (needle.includes("deposit") || needle.includes("deposito")) &&
    t.type === "deposit"
  ) {
    return true;
  }
  if (
    (needle.includes("preliev") || needle.includes("withdraw")) &&
    t.type === "withdrawal"
  ) {
    return true;
  }

  const st: TransactionStatus = isTransactionStatus(t.status) ? t.status : "pending";
  if (transactionStatusLabel(st).toLowerCase().includes(needle)) return true;

  const amt = parseAmount(t.amount);
  if (!Number.isNaN(amt)) {
    const compact = String(amt).toLowerCase();
    const itFmt = formatMoney(t.amount).replace(/\s/g, "").toLowerCase();
    if (compact.includes(needle) || itFmt.includes(needle.replace(/\s/g, ""))) return true;
  }
  return false;
}

const movRowClass =
  "w-full cursor-pointer rounded-2xl border border-white/[0.06] bg-[#11182B]/72 px-2.5 py-2.5 text-left text-sm leading-snug shadow-sm outline-none backdrop-blur-md transition-[border-color,background-color,transform] duration-150 ease-out hover:border-emerald-500/22 hover:shadow-sm hover:scale-[1.01] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#A970FF]/18 sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm sm:leading-normal";

const movRowClassInvalid =
  "w-full cursor-pointer rounded-2xl border border-white/[0.06] bg-[#11182B]/55 px-2.5 py-2.5 text-left text-sm leading-snug shadow-sm outline-none backdrop-blur-md transition-[border-color,background-color] duration-150 ease-out hover:border-white/[0.1] hover:bg-[#11182B]/70 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#A970FF]/16 sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm sm:leading-normal";

const wdStatusPickBtn =
  "flex min-h-[2.5rem] w-full items-center justify-center rounded-xl border px-3 text-sm font-semibold transition duration-150 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

const wdStatusPickBtnIdle =
  "border-white/[0.1] bg-[#121a28]/85 text-[#e2e8f0] hover:border-white/18 hover:bg-[#151e2e]";

const wdStatusPickBtnCurrent =
  "border-[#A970FF]/50 bg-[#151B2E]/95 text-white ring-1 ring-[#A970FF]/25";

/** Filtri avanzati: compatto su mobile */
const compactCtrl =
  "mt-0.5 flex min-h-[36px] w-full items-center rounded-lg border border-white/[0.06] bg-[#131C31]/90 px-2 text-sm leading-snug text-[#e2e8f0] outline-none transition duration-150 placeholder:text-[#8B93A7] focus:border-[#A970FF]/30 focus:ring-1 focus:ring-[#A970FF]/08 sm:h-[38px] sm:max-h-[38px] sm:min-h-0 sm:px-2 sm:text-xs";

const dateInputGlass =
  "min-h-[36px] w-full min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-[#131C31]/90 py-1 pl-8 pr-2 text-sm leading-snug text-[#e2e8f0] outline-none transition focus:border-[#A970FF]/30 focus:ring-1 focus:ring-[#A970FF]/08 [color-scheme:dark] sm:h-[38px] sm:max-h-[38px] sm:min-h-0 sm:py-1 sm:pr-2 sm:text-xs";

function MovimentiListaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [accounts, setAccounts] = useState<GamingAccountRow[]>([]);
  const [methods, setMethods] = useState<PaymentMethodRow[]>([]);
  const [fetchedRows, setFetchedRows] = useState<TxRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [filterPlayer, setFilterPlayer] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterType, setFilterType] = useState<TxType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<TransactionStatus | "all">("all");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [amountMinStr, setAmountMinStr] = useState("");
  const [amountMaxStr, setAmountMaxStr] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailTx, setDetailTx] = useState<TxRow | null>(null);
  const [withdrawalStatusTx, setWithdrawalStatusTx] = useState<TxRow | null>(null);
  const [withdrawalStatusError, setWithdrawalStatusError] = useState<string | null>(null);
  const [withdrawalStatusBusyId, setWithdrawalStatusBusyId] = useState<string | null>(null);

  const playerMap = useMemo(() => {
    const m = new Map<string, PlayerRow>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const accountMap = useMemo(() => {
    const m = new Map<string, GamingAccountRow>();
    for (const a of accounts) m.set(a.id, a);
    return m;
  }, [accounts]);

  const methodMap = useMemo(() => {
    const m = new Map<string, PaymentMethodRow>();
    for (const pm of methods) m.set(pm.id, pm);
    return m;
  }, [methods]);

  const accountsForPlayer = useMemo(() => {
    if (!filterPlayer) return accounts;
    return accounts.filter((a) => a.player_id === filterPlayer);
  }, [accounts, filterPlayer]);

  const methodsForPlayer = useMemo(() => {
    if (!filterPlayer) return methods;
    return methods.filter((m) => m.player_id === filterPlayer);
  }, [methods, filterPlayer]);

  const loadReference = useCallback(async () => {
    setLoadError(null);
    const [pRes, gaRes, pmRes] = await Promise.all([
      supabase.from("players").select("id, name").order("name"),
      supabase
        .from("gaming_accounts")
        .select(
          `
          id,
          player_id,
          account_name,
          bookmaker,
          bookmaker_id,
          bookmakers ( name )
        `,
        )
        .order("account_name"),
      supabase
        .from("payment_methods")
        .select('id, label, method_name, player_id, "type"')
        .order("method_name"),
    ]);
    if (pRes.error || gaRes.error || pmRes.error) {
      setLoadError(
        pRes.error?.message ??
          gaRes.error?.message ??
          pmRes.error?.message ??
          "Errore caricamento",
      );
      setPlayers([]);
      setAccounts([]);
      setMethods([]);
      return;
    }
    setPlayers((pRes.data as PlayerRow[]) ?? []);
    setAccounts((gaRes.data as GamingAccountRow[]) ?? []);
    setMethods((pmRes.data as PaymentMethodRow[]) ?? []);
  }, [supabase]);

  const filterRef = useRef({
    filterPlayer,
    filterAccount,
    filterMethod,
    filterType,
    filterStatus,
    periodPreset,
    customFrom,
    customTo,
    amountMinStr,
    amountMaxStr,
  });
  useLayoutEffect(() => {
    filterRef.current = {
      filterPlayer,
      filterAccount,
      filterMethod,
      filterType,
      filterStatus,
      periodPreset,
      customFrom,
      customTo,
      amountMinStr,
      amountMaxStr,
    };
  }, [
    filterPlayer,
    filterAccount,
    filterMethod,
    filterType,
    filterStatus,
    periodPreset,
    customFrom,
    customTo,
    amountMinStr,
    amountMaxStr,
  ]);

  /** Solo con intervallo manuale le date influenzano la query; con preset rapido evita refetch al sync UI. */
  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        filterPlayer,
        filterAccount,
        filterMethod,
        filterType,
        filterStatus,
        periodPreset,
        customRangeKey:
          periodPreset === "custom" ? `${customFrom}|${customTo}` : "__preset__",
        amountMinStr,
        amountMaxStr,
      }),
    [
      filterPlayer,
      filterAccount,
      filterMethod,
      filterType,
      filterStatus,
      periodPreset,
      customFrom,
      customTo,
      amountMinStr,
      amountMaxStr,
    ],
  );

  const fetchTransactions = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    const f = filterRef.current;
    let from: string | null = null;
    let to: string | null = null;
    if (f.periodPreset === "all") {
      from = null;
      to = null;
    } else if (f.periodPreset === "custom") {
      const b = periodBounds("custom", f.customFrom, f.customTo);
      from = b.from;
      to = b.to;
    } else {
      const b = periodBounds(f.periodPreset, "", "");
      from = b.from;
      to = b.to;
    }
    const minN = f.amountMinStr.trim() ? parseAmount(f.amountMinStr.trim()) : NaN;
    const maxN = f.amountMaxStr.trim() ? parseAmount(f.amountMaxStr.trim()) : NaN;

    let q = supabase
      .from("transactions")
      .select(
        "id, type, amount, status, created_at, note, gaming_account_id, payment_method_id, player_id",
      )
      .order("created_at", { ascending: false })
      .limit(2000);

    if (f.filterPlayer) q = q.eq("player_id", f.filterPlayer);
    if (f.filterAccount) q = q.eq("gaming_account_id", f.filterAccount);
    if (f.filterMethod) q = q.eq("payment_method_id", f.filterMethod);
    if (f.filterType !== "all") q = q.eq("type", f.filterType);
    if (f.filterStatus !== "all") q = q.eq("status", f.filterStatus);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    if (!Number.isNaN(minN) && minN > 0) q = q.gte("amount", minN);
    if (!Number.isNaN(maxN) && maxN > 0) q = q.lte("amount", maxN);

    const { data, error } = await q;
    setLoadingList(false);
    if (error) {
      setListError(error.message);
      setFetchedRows([]);
      return;
    }
    setFetchedRows((data as TxRow[]) ?? []);
  }, [supabase]);

  const applyWithdrawalStatusFromSheet = useCallback(
    async (t: TxRow, newStatus: TransactionStatus) => {
      if (t.type !== "withdrawal") return;
      const cur: TransactionStatus = isTransactionStatus(t.status) ? t.status : "pending";
      if (cur === newStatus) {
        setWithdrawalStatusTx(null);
        setWithdrawalStatusError(null);
        return;
      }
      setWithdrawalStatusError(null);
      setWithdrawalStatusBusyId(t.id);
      const row = {
        id: t.id,
        type: t.type,
        status: t.status,
        amount: String(t.amount),
        gaming_account_id: t.gaming_account_id,
        payment_method_id: t.payment_method_id,
      };
      const res = await applyWithdrawalStatusChange(supabase, row, newStatus);
      setWithdrawalStatusBusyId(null);
      if (!res.ok) {
        setWithdrawalStatusError(res.message);
        return;
      }
      setWithdrawalStatusTx(null);
      await Promise.all([fetchTransactions(), loadReference()]);
    },
    [supabase, fetchTransactions, loadReference],
  );

  const FILTER_DEBOUNCE_MS = 280;
  const didInitialFetch = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (!didInitialFetch.current) {
      didInitialFetch.current = true;
      void fetchTransactions();
      return;
    }
    const id = window.setTimeout(() => void fetchTransactions(), FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [ready, filterSignature, fetchTransactions]);

  const rows = useMemo(() => {
    const rawSearch = searchQuery.trim();
    if (!rawSearch) return fetchedRows;
    const needle = rawSearch.toLowerCase();
    return fetchedRows.filter((t) => txMatchesLiveSearch(t, needle, playerMap, accountMap, methodMap));
  }, [fetchedRows, searchQuery, accountMap, methodMap, playerMap]);

  const grouped = useMemo(() => groupTxByMonthDay(rows), [rows]);

  useEffect(() => {
    queueMicrotask(() => {
      const player = searchParams.get("player") ?? searchParams.get("identity") ?? "";
      const account = searchParams.get("account") ?? "";
      if (player) setFilterPlayer(player);
      if (account) setFilterAccount(account);
    });
  }, [searchParams]);

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
      await loadReference();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [loadReference, router, supabase]);

  useEffect(() => {
    queueMicrotask(() => {
      if (filterPlayer && filterAccount) {
        const ok = accountsForPlayer.some((a) => a.id === filterAccount);
        if (!ok) setFilterAccount("");
      }
    });
  }, [filterPlayer, filterAccount, accountsForPlayer]);

  useEffect(() => {
    queueMicrotask(() => {
      if (filterPlayer && filterMethod) {
        const ok = methodsForPlayer.some((m) => m.id === filterMethod);
        if (!ok) setFilterMethod("");
      }
    });
  }, [filterPlayer, filterMethod, methodsForPlayer]);

  /** Sincronizza date visibili con preset rapido (non in modalità intervallo manuale). */
  useEffect(() => {
    queueMicrotask(() => {
      if (periodPreset === "all") {
        setCustomFrom("");
        setCustomTo("");
        return;
      }
      if (periodPreset === "custom") return;
      const b = periodBounds(periodPreset, "", "");
      if (b.from && b.to) {
        setCustomFrom(toYmdFromIso(b.from));
        setCustomTo(toYmdFromIso(b.to));
      }
    });
  }, [periodPreset]);

  /** Riepiloghi sui movimenti filtrati (dopo ricerca live). */
  const stats = useMemo(() => {
    let depCompleted = 0;
    let wdrCompleted = 0;
    let pendingSum = 0;

    for (const t of rows) {
      const a = parseAmount(t.amount);
      if (Number.isNaN(a)) continue;
      if (t.status === "completed") {
        if (t.type === "deposit") depCompleted += a;
        else wdrCompleted += a;
      }
      if (t.status === "pending") pendingSum += a;
    }

    const count = rows.length;
    const netCompleted = depCompleted - wdrCompleted;

    return {
      depCompleted,
      wdrCompleted,
      netCompleted,
      pendingSum,
      count,
    };
  }, [rows]);

  if (!ready) {
    return (
      <AppShell title="Movimenti">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-lg sm:text-base text-[#8B93A7] sm:text-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#A970FF] border-t-transparent" />
          Caricamento…
        </div>
      </AppShell>
    );
  }

  const periodChips = [
    { value: "today" as const, label: "Oggi" },
    { value: "7d" as const, label: "7g" },
    { value: "30d" as const, label: "30g" },
    { value: "month" as const, label: "Mese" },
    { value: "all" as const, label: "Tutto" },
  ];

  const calendarIcon = (
    <svg
      className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#8B93A7] sm:left-2.5 sm:h-3.5 sm:w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );

  const emptyServer =
    !loadingList && !listError && fetchedRows.length === 0 && rows.length === 0;
  const emptyLiveSearch =
    fetchedRows.length > 0 && rows.length === 0 && searchQuery.trim().length > 0;

  return (
    <AppShell title="Movimenti">
      {loadError ? (
        <p className="mb-2 rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-lg sm:text-base text-[#fb7185] sm:text-sm">
          {loadError}
        </p>
      ) : null}
      {listError ? (
        <p className="mb-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-lg sm:text-base text-amber-200 sm:text-sm">
          {listError}
        </p>
      ) : null}

      <div className="sticky top-12 z-[25] -mx-2.5 mb-1.5 space-y-1.5 border-b border-white/[0.06] bg-[#0A1020]/95 px-2.5 py-1.5 backdrop-blur-md sm:top-14 sm:-mx-4 sm:mb-2 sm:space-y-2 sm:px-4 sm:py-2">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Cerca movimento..."
        />

        <div>
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:text-xs">
            Periodo
          </p>
          <div className="flex gap-0.5 overflow-x-auto scroll-smooth pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1 sm:pb-0.5">
            {periodChips.map(({ value, label }) => {
              const active = periodPreset === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriodPreset(value)}
                  className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold transition duration-150 ease-out active:scale-[0.97] sm:px-2.5 sm:py-1 sm:text-xs ${
                    active
                      ? "border-[#A970FF]/40 bg-[#A970FF]/16 text-white shadow-sm ring-1 ring-[#A970FF]/12"
                      : "border-white/[0.06] bg-[#131C31]/80 text-[#8B93A7] hover:border-white/[0.12] hover:text-[#e2e8f0]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-[#11182B]/60 px-1.5 py-1.5 backdrop-blur-sm sm:px-2 sm:py-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#8B93A7] sm:text-xs">
            Intervallo date
          </p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <span className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7] sm:text-xs">
                Da
              </span>
              <div className="relative">
                {calendarIcon}
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    setPeriodPreset("custom");
                  }}
                  className={dateInputGlass}
                />
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <span className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7] sm:text-xs">
                A
              </span>
              <div className="relative">
                {calendarIcon}
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setPeriodPreset("custom");
                  }}
                  className={dateInputGlass}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-1.5">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="rounded-full border border-white/[0.06] bg-[#131C31]/80 px-3 py-1.5 text-xs font-semibold text-[#B4BCCC] transition duration-150 ease-out hover:border-white/[0.12] hover:text-white active:scale-[0.98] sm:px-3 sm:py-1.5 sm:text-xs"
        >
          {filtersOpen ? "Nascondi filtri" : "Filtri avanzati"}
        </button>
      </div>

      {filtersOpen ? (
        <div className="mb-1.5 space-y-1.5 rounded-lg border border-white/[0.06] bg-[#11182B]/72 p-2 shadow-sm backdrop-blur-md sm:mb-2 sm:space-y-2 sm:p-2.5">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <label className="block text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7] sm:text-xs">
              Identità
              <select
                value={filterPlayer}
                onChange={(e) => {
                  setFilterPlayer(e.target.value);
                  setFilterAccount("");
                  setFilterMethod("");
                }}
                className={compactCtrl}
              >
                <option value="">Tutte</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7] sm:text-xs">
              Conto
              <select
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
                className={compactCtrl}
              >
                <option value="">Tutti</option>
                {accountsForPlayer.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name}
                    {gamingAccountBookmakerDisplay(a) ? ` · ${gamingAccountBookmakerDisplay(a)}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7] sm:text-xs">
              Metodo
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className={compactCtrl}
              >
                <option value="">Tutti</option>
                {methodsForPlayer.map((m) => (
                  <option key={m.id} value={m.id}>
                    {paymentMethodTitle({
                      label: m.label,
                      method_name: m.method_name,
                      type: m.type,
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7] sm:text-xs">
              Tipo
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as TxType | "all")}
                className={compactCtrl}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7] sm:text-xs">
              Stato (vista)
              <select
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus(e.target.value as TransactionStatus | "all")
                }
                className={compactCtrl}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <label className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7] sm:text-xs">
              Importo min €
              <input
                value={amountMinStr}
                onChange={(e) => setAmountMinStr(e.target.value)}
                inputMode="decimal"
                placeholder="—"
                className={compactCtrl}
              />
            </label>
            <label className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7] sm:text-xs">
              Importo max €
              <input
                value={amountMaxStr}
                onChange={(e) => setAmountMaxStr(e.target.value)}
                inputMode="decimal"
                placeholder="—"
                className={compactCtrl}
              />
            </label>
          </div>
        </div>
      ) : null}

      <section
        className={`mb-1.5 rounded-lg border border-white/[0.06] bg-[#0C1324]/55 px-2 py-1.5 backdrop-blur-sm transition-opacity duration-200 ease-out sm:mb-2 sm:px-2.5 sm:py-2 ${
          loadingList && fetchedRows.length > 0 ? "opacity-[0.88]" : "opacity-100"
        }`}
        aria-label="Risultati filtrati"
      >
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-[#8B93A7] sm:mb-1.5 sm:text-xs">
          Risultati filtrati
        </p>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-tight text-[#8B93A7] sm:gap-x-4 sm:gap-y-1 sm:text-xs sm:leading-tight">
          <span>
            Depositi{" "}
            <strong className="ml-0.5 tabular-nums text-emerald-300">
              +{formatMoney(stats.depCompleted)} €
            </strong>
          </span>
          <span>
            Prelievi{" "}
            <strong className="ml-0.5 tabular-nums text-[#f87171]">
              {formatMoney(stats.wdrCompleted)} €
            </strong>
          </span>
          <span>
            Netto{" "}
            <strong
              className={`ml-0.5 tabular-nums ${
                stats.netCompleted > 0
                  ? "text-indigo-300"
                  : stats.netCompleted < 0
                    ? "text-[#fb7185]"
                    : "text-[#8B93A7]"
              }`}
            >
              {stats.netCompleted > 0 ? "+" : ""}
              {formatMoney(stats.netCompleted)} €
            </strong>
          </span>
          <span className="text-[#fdba74]">
            In attesa{" "}
            <strong className="ml-0.5 tabular-nums text-[#fdba74]">
              {formatMoney(stats.pendingSum)} €
            </strong>
          </span>
          <span>
            N. movimenti <strong className="ml-0.5 tabular-nums text-white">{stats.count}</strong>
          </span>
        </div>
      </section>

      {loadingList && fetchedRows.length === 0 ? (
        <div className="space-y-2 py-6" aria-busy="true">
          <div className="mx-auto h-2 max-w-[200px] animate-pulse rounded-full bg-[#1e293b]" />
          <div className="mx-auto h-2 max-w-[140px] animate-pulse rounded-full bg-[#1e293b]/80" />
          <div className="mx-auto h-2 max-w-[180px] animate-pulse rounded-full bg-[#1e293b]/60" />
        </div>
      ) : emptyLiveSearch ? (
        <p className="rounded-xl border border-dashed border-white/[0.06] py-8 text-center text-lg sm:text-base text-[#8B93A7] sm:text-xs">
          Nessun risultato
        </p>
      ) : emptyServer ? (
        <p className="rounded-xl border border-dashed border-white/[0.06] py-8 text-center text-lg sm:text-base text-[#8B93A7] sm:text-xs">
          Nessun movimento con i filtri selezionati.
        </p>
      ) : (
        <div
          className={`space-y-3 pb-8 transition-opacity duration-200 ease-out sm:space-y-4 sm:pb-10 ${
            loadingList && fetchedRows.length > 0 ? "opacity-[0.92]" : "opacity-100"
          }`}
        >
          {grouped.map((month) => (
            <section key={month.monthKey} className="space-y-1.5 sm:space-y-2">
              <header className="flex items-baseline justify-between gap-2 border-b border-white/10 pb-0.5 sm:pb-1">
                <h2 className="text-base font-bold uppercase tracking-[0.1em] text-[#8B93A7] sm:text-xl">
                  {month.monthTitle}
                </h2>
                <p
                  className={`shrink-0 whitespace-nowrap text-lg font-bold tabular-nums sm:text-2xl sm:font-bold ${totalHeaderClass(month.monthTotal)}`}
                >
                  {signedTotalLabel(month.monthTotal)}
                </p>
              </header>
              {month.days.map((day) => (
                <div key={day.dayKey} className="space-y-1 sm:space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 pl-0.5">
                    <h3 className="text-[11px] font-bold capitalize tracking-wide text-[#6B7385] sm:text-lg sm:font-semibold">
                      {day.dayTitle}
                    </h3>
                    <p
                      className={`shrink-0 whitespace-nowrap text-sm font-bold tabular-nums sm:text-xl sm:font-semibold ${totalHeaderClass(day.dayTotal)}`}
                    >
                      {signedTotalLabel(day.dayTotal)}
                    </p>
                  </div>
                  <ul className="flex list-none flex-col gap-1.5 p-0 sm:gap-1.5">
                    {day.items.map((t) => {
                      const st: TransactionStatus = isTransactionStatus(t.status)
                        ? t.status
                        : "pending";
                      const acc = accountMap.get(t.gaming_account_id);
                      const pm = methodMap.get(t.payment_method_id);
                      const accLabel = acc
                        ? acc.account_name
                        : "—";
                      const pmLabel = pm
                        ? paymentMethodTitle({
                            label: pm.label,
                            method_name: pm.method_name,
                            type: pm.type,
                          })
                        : "—";
                      const typeLabel = t.type === "deposit" ? "Deposito" : "Prelievo";
                      const invalid = txIsInvalid(t);
                      const openDetailFromRow = () => setDetailTx(t);
                      return (
                        <li key={t.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest("[data-withdrawal-status-badge]")) {
                                return;
                              }
                              openDetailFromRow();
                            }}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              if ((e.target as HTMLElement).closest("[data-withdrawal-status-badge]")) {
                                return;
                              }
                              e.preventDefault();
                              openDetailFromRow();
                            }}
                            className={invalid ? movRowClassInvalid : movRowClass}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={`min-w-0 flex-1 truncate text-left text-sm font-medium leading-snug sm:text-sm ${
                                  invalid
                                    ? "text-[#9aa0a6] line-through"
                                    : "text-[#e2e8f0]"
                                }`}
                              >
                                {invalid ? (
                                  `${typeLabel} • ${accLabel} • ${pmLabel}`
                                ) : (
                                  <>
                                    <span className={txTypeWordClass(t)}>{typeLabel}</span>
                                    <span className="text-[#8B93A7]">{` • ${accLabel} • ${pmLabel}`}</span>
                                  </>
                                )}
                              </p>
                              <p
                                className={`shrink-0 whitespace-nowrap text-right text-base font-bold tabular-nums sm:text-sm sm:font-bold ${txAmountRowClass(t)}`}
                              >
                                {formatMoney(t.amount)} €
                              </p>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-2">
                              <span
                                className={`truncate text-left text-xs leading-tight sm:text-xs ${
                                  invalid ? "text-[#9aa0a6] line-through" : "text-[#8B93A7]"
                                }`}
                              >
                                {formatListWhen(t.created_at)}
                              </span>
                              {t.type === "withdrawal" ? (
                                <button
                                  type="button"
                                  data-withdrawal-status-badge
                                  aria-label={`Cambia stato prelievo: ${transactionStatusLabel(st)}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setWithdrawalStatusError(null);
                                    setWithdrawalStatusTx(t);
                                  }}
                                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] transition duration-150 hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A970FF]/22 sm:px-2 sm:py-0.5 sm:text-xs sm:tracking-wide ${movimentiStatusBadgeClass(t)}`}
                                >
                                  {transactionStatusLabel(st)}
                                </button>
                              ) : (
                                <span
                                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] sm:px-2 sm:py-0.5 sm:text-xs sm:tracking-wide ${movimentiStatusBadgeClass(t)}`}
                                >
                                  {transactionStatusLabel(st)}
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <BottomSheet
        open={withdrawalStatusTx !== null}
        title="Stato prelievo"
        stackClassName="z-[100]"
        panelClassName="!max-w-[420px]"
        dismissDisabled={withdrawalStatusBusyId !== null}
        onClose={() => {
          if (withdrawalStatusBusyId) return;
          setWithdrawalStatusTx(null);
          setWithdrawalStatusError(null);
        }}
      >
        {withdrawalStatusTx ? (
          <div className="mx-auto flex max-w-[360px] flex-col gap-3 pb-1">
            {(() => {
              const t = withdrawalStatusTx;
              const acc = accountMap.get(t.gaming_account_id);
              const pm = methodMap.get(t.payment_method_id);
              const bkDisp = acc ? gamingAccountBookmakerDisplay(acc) : "";
              const accLine = acc ? (bkDisp ? `${acc.account_name} · ${bkDisp}` : acc.account_name) : "—";
              const pmLine = pm
                ? paymentMethodTitle({
                    label: pm.label,
                    method_name: pm.method_name,
                    type: pm.type,
                  })
                : "—";
              const cur: TransactionStatus = isTransactionStatus(t.status) ? t.status : "pending";
              const busy = withdrawalStatusBusyId === t.id;
              const invalid = txIsInvalid(t);
              const amtCls = invalid
                ? "text-[#9aa0a6] line-through"
                : cur === "pending"
                  ? "text-[#fb923c]"
                  : "text-[#ff5f5f]";
              return (
                <>
                  <div className="rounded-xl border border-white/[0.06] bg-[#11182B]/60 px-3 py-3 text-center backdrop-blur-sm">
                    <p className={`text-2xl font-bold tabular-nums ${amtCls}`}>
                      {formatMoney(t.amount)} €
                    </p>
                    <dl className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3 text-left text-lg sm:text-base sm:text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-[#8B93A7]">Conto</dt>
                        <dd className="max-w-[65%] text-right font-medium text-[#e2e8f0]">{accLine}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[#8B93A7]">Metodo</dt>
                        <dd className="max-w-[65%] text-right font-medium text-[#e2e8f0]">{pmLine}</dd>
                      </div>
                    </dl>
                  </div>
                  {withdrawalStatusError ? (
                    <p
                      className="rounded-lg border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-lg sm:text-base text-[#fb7185] sm:text-sm"
                      role="alert"
                    >
                      {withdrawalStatusError}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    {WITHDRAWAL_STATUS_SELECT_OPTIONS.slice(0, 2).map((opt) => {
                      const isCurrent = opt.value === cur;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={busy}
                          className={`${wdStatusPickBtn} ${isCurrent ? wdStatusPickBtnCurrent : wdStatusPickBtnIdle}`}
                          onClick={() => void applyWithdrawalStatusFromSheet(t, opt.value)}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                    <p className="pt-0.5 text-center text-sm sm:text-xs font-semibold uppercase tracking-[0.14em] text-[#8B93A7] sm:text-xs">
                      Annullato / rifiutato
                    </p>
                    {WITHDRAWAL_STATUS_SELECT_OPTIONS.slice(2).map((opt) => {
                      const isCurrent = opt.value === cur;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={busy}
                          className={`${wdStatusPickBtn} ${isCurrent ? wdStatusPickBtnCurrent : wdStatusPickBtnIdle}`}
                          onClick={() => void applyWithdrawalStatusFromSheet(t, opt.value)}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={detailTx !== null}
        title="Movimento"
        stackClassName="z-[95]"
        panelClassName="!max-w-[420px]"
        onClose={() => setDetailTx(null)}
      >
        {detailTx ? (
          <div className="mx-auto flex max-w-[360px] flex-col gap-3 pb-1">
            {(() => {
              const t = detailTx;
              const st: TransactionStatus = isTransactionStatus(t.status) ? t.status : "pending";
              const acc = accountMap.get(t.gaming_account_id);
              const pm = methodMap.get(t.payment_method_id);
              const idn = playerMap.get(t.player_id);
              const invalid = st === "cancelled" || st === "rejected";
              const balCls = invalid
                ? "text-[#9aa0a6]"
                : st === "pending"
                  ? "text-[#fb923c]"
                  : t.type === "deposit"
                    ? "text-emerald-400"
                    : "text-[#ff5f5f]";
              const typeTitle = t.type === "deposit" ? "Deposito" : "Prelievo";
              const typeTitleCls = invalid
                ? "text-[#9aa0a6] line-through"
                : st === "pending"
                  ? "text-[#fdba74]"
                  : t.type === "deposit"
                    ? "text-emerald-400/95"
                    : "text-[#f87171]";
              return (
                <>
                  <div className="rounded-xl border border-white/[0.06] bg-[#11182B]/60 px-3 py-4 text-center backdrop-blur-sm">
                    <p
                      className={`text-lg sm:text-sm font-semibold uppercase tracking-[0.14em] sm:text-xs ${typeTitleCls}`}
                    >
                      {typeTitle}
                    </p>
                    <p
                      className={`mt-1 whitespace-nowrap text-[28px] font-bold tabular-nums transition-colors duration-150 sm:text-3xl ${balCls} ${invalid ? "line-through" : ""}`}
                    >
                      {formatMoney(t.amount)} €
                    </p>
                    <p className="mt-2 flex justify-center">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-sm sm:text-xs font-bold uppercase tracking-wide sm:py-0.5 sm:text-xs ${movimentiStatusBadgeClass(t)}`}
                      >
                        {transactionStatusLabel(st)}
                      </span>
                    </p>
                  </div>
                  <dl className="space-y-2 rounded-xl border border-white/[0.06] bg-[#0C1324]/50 px-3 py-3 text-lg sm:text-base sm:py-2.5 sm:text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#8B93A7]">Identità</dt>
                      <dd className="max-w-[60%] text-right font-medium text-[#e2e8f0]">
                        {idn?.name ?? "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#8B93A7]">Conto</dt>
                      <dd className="max-w-[60%] text-right font-medium text-[#e2e8f0]">
                        {acc
                          ? `${acc.account_name}${gamingAccountBookmakerDisplay(acc) ? ` · ${gamingAccountBookmakerDisplay(acc)}` : ""}`
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#8B93A7]">Metodo</dt>
                      <dd className="max-w-[60%] text-right font-medium text-[#e2e8f0]">
                        {pm
                          ? paymentMethodTitle({
                              label: pm.label,
                              method_name: pm.method_name,
                              type: pm.type,
                            })
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#8B93A7]">Data</dt>
                      <dd className="text-right font-medium text-[#B4BCCC]">{formatWhen(t.created_at)}</dd>
                    </div>
                    <div className="border-t border-white/[0.06] pt-2">
                      <dt className="text-[#8B93A7]">Note</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-[#8B93A7]">
                        {t.note?.trim() ? t.note : "—"}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-center text-lg sm:text-sm leading-relaxed text-[#6B7385] sm:text-xs">
                    Registro contabile: solo lettura. Per nuovi movimenti usa Deposita / Preleva dai conti.
                  </p>
                </>
              );
            })()}
          </div>
        ) : null}
      </BottomSheet>
    </AppShell>
  );
}

export default function MovimentiPage() {
  return (
    <AuthGate>
      <Suspense
        fallback={
          <AppShell title="Movimenti">
            <div className="flex min-h-[30vh] items-center justify-center text-lg sm:text-base text-[#8B93A7] sm:text-sm">
              Caricamento…
            </div>
          </AppShell>
        }
      >
        <MovimentiListaContent />
      </Suspense>
    </AuthGate>
  );
}
