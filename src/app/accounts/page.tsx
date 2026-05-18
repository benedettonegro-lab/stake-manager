"use client";

import { BottomSheet, QuickActionButton, SearchInput, StatPill } from "@/components/app";
import type { GamingAccountStatus } from "@/components/gaming-account-card";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import Link from "next/link";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import { paymentMethodTitle } from "@/lib/payment-methods";
import { fetchGamingAccountBalanceMap } from "@/lib/repositories/gaming-accounts-repository";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { readStaleCache, writeFreshCache } from "@/lib/swr-cache";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { PageLoadGate } from "@/components/ui/page-load-gate";
import { usePageLoad } from "@/hooks/use-page-load";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PlayerOption = { id: string; name: string };

type BookmakerOption = { id: string; name: string };

type AccountListRow = {
  id: string;
  player_id: string;
  identity_id: string;
  account_name: string;
  bookmaker: string;
  bookmaker_id: string | null;
  bookmakers: { name: string } | { name: string }[] | null;
  note: string | null;
  initial_balance: string;
  current_balance: string;
  account_status: GamingAccountStatus | null;
};

type PaymentMethodRow = {
  id: string;
  label: string | null;
  method_name: string;
  balance: string;
  player_id: string;
  identity_id: string;
  type: string;
  note: string | null;
};

/** Conti gioco del player selezionato nel form (nessun join con payment_methods). */
type GamingAccountBrief = {
  id: string;
  account_name: string;
  bookmaker: string;
  bookmaker_id: string | null;
  bookmakers: { name: string } | { name: string }[] | null;
};

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

const ACCOUNT_STATUS_LABEL: Record<GamingAccountStatus, string> = {
  active: "Attivo",
  paused: "In pausa",
  closed: "Chiuso",
};

/** Lista conti — glass compatto (allineato a identità) */
const accListCardClass =
  "w-full cursor-pointer rounded-2xl border border-white/[0.06] bg-[#11182B]/72 px-2.5 py-2 text-left text-sm shadow-sm outline-none backdrop-blur-md transition-all duration-200 ease-out hover:border-emerald-500/22 hover:shadow-sm hover:scale-[1.02] active:scale-[0.99] sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-base";

const accActionBtnClass =
  "flex min-h-10 w-full items-center justify-center rounded-xl border text-sm font-semibold transition duration-150 ease-out active:scale-[0.98] sm:min-h-12 sm:text-sm";

function parseAmount(s: string): number {
  return Number.parseFloat(s.replace(",", "."));
}

export default function AccountsListPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const balanceRefreshLock = useRef(false);
  const [accounts, setAccounts] = useState<AccountListRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [bookmakers, setBookmakers] = useState<BookmakerOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [createPlayerId, setCreatePlayerId] = useState("");
  const [createAccountName, setCreateAccountName] = useState("");
  const [createBookmakerId, setCreateBookmakerId] = useState("");
  const [createInitialStr, setCreateInitialStr] = useState("");
  const [createNote, setCreateNote] = useState("");
  const [createStatus, setCreateStatus] = useState<GamingAccountStatus>("active");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [methodsForSelectedPlayer, setMethodsForSelectedPlayer] = useState<
    PaymentMethodRow[]
  >([]);
  const [accountsForCreatePlayer, setAccountsForCreatePlayer] = useState<
    GamingAccountBrief[]
  >([]);
  const [methodsPlayerLoading, setMethodsPlayerLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<AccountListRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editBookmakerId, setEditBookmakerId] = useState("");
  const [editBookmakerLegacy, setEditBookmakerLegacy] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editStatus, setEditStatus] = useState<GamingAccountStatus>("active");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AccountListRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);

  /** Conto selezionato — azioni in bottom sheet */
  const [detailAccount, setDetailAccount] = useState<AccountListRow | null>(null);

  const refreshBalancesLight = useCallback(async () => {
    const res = await fetchGamingAccountBalanceMap(supabase);
    if (!res.ok) return;
    setAccounts((prev) =>
      prev.map((a) => {
        const bal = res.map.get(a.id);
        return bal !== undefined ? { ...a, current_balance: bal } : a;
      }),
    );
  }, [supabase]);

  const loadData = useCallback(async (uid: string) => {
    const [aRes, pmRes, pRes, bmRes] = await Promise.all([
      supabase
        .from("gaming_accounts")
        .select(
          `
          id,
          account_name,
          bookmaker,
          bookmaker_id,
          current_balance,
          initial_balance,
          player_id,
          identity_id,
          account_status,
          note,
          bookmakers ( name )
        `,
        )
        .order("account_name"),
      supabase
        .from("payment_methods")
        .select(
          `
          id,
          label,
          method_name,
          balance,
          player_id,
          identity_id,
          note,
          "type"
        `,
        )
        .order("method_name"),
      supabase.from("players").select("id, name").order("name"),
      supabase.from("bookmakers").select("id, name").order("name"),
    ]);

    if (aRes.error || pmRes.error || pRes.error || bmRes.error) {
      const msg =
        aRes.error?.message ??
        pmRes.error?.message ??
        pRes.error?.message ??
        bmRes.error?.message ??
        "Errore caricamento";
      setLoadError(msg);
      setAccounts([]);
      setPaymentMethods([]);
      setPlayers([]);
      setBookmakers([]);
      throw new Error(msg);
    }
    const acc = (aRes.data as unknown as AccountListRow[]) ?? [];
    setAccounts(acc);
    setPaymentMethods((pmRes.data as unknown as PaymentMethodRow[]) ?? []);
    setPlayers((pRes.data as PlayerOption[]) ?? []);
    setBookmakers((bmRes.data as BookmakerOption[]) ?? []);
    if (uid) void writeFreshCache(uid, "accounts_list_v1", acc);
  }, [supabase]);

  const {
    ready,
    userId,
    loadError: pageLoadError,
    initialFetchComplete,
    retry: retryPageLoad,
  } = usePageLoad({
    page: "accounts",
    hydrateFromCache: async (uid) => {
      const cached = await readStaleCache<AccountListRow[]>(uid, "accounts_list_v1");
      if (cached.data?.length) {
        setAccounts(cached.data);
        return true;
      }
      return false;
    },
    fetch: loadData,
  });

  const displayLoadError = pageLoadError ?? loadError;

  useSupabaseRealtime({
    userId,
    enabled: Boolean(userId) && initialFetchComplete,
    onGamingAccountChange: () => {
      if (balanceRefreshLock.current) return;
      balanceRefreshLock.current = true;
      window.setTimeout(() => {
        balanceRefreshLock.current = false;
        void refreshBalancesLight();
      }, 300);
    },
  });

  const identityNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of players) m.set(p.id, p.name);
    return m;
  }, [players]);

  const filteredAccounts = useMemo(() => {
    const raw = searchQuery.trim();
    if (!raw) return accounts;
    const q = raw.toLowerCase();
    return accounts.filter((a) => {
      const idn = (identityNameById.get(a.identity_id) ?? "").toLowerCase();
      const name = a.account_name.toLowerCase();
      const bm = gamingAccountBookmakerDisplay(a).toLowerCase();
      return name.includes(q) || bm.includes(q) || idn.includes(q);
    });
  }, [accounts, identityNameById, searchQuery]);

  const totalAccountsBalance = useMemo(
    () =>
      accounts.reduce(
        (s, a) => s + (Number.parseFloat(a.current_balance) || 0),
        0,
      ),
    [accounts],
  );

  const totalPaymentMethodsBalance = useMemo(
    () =>
      paymentMethods.reduce(
        (s, p) => s + (Number.parseFloat(p.balance) || 0),
        0,
      ),
    [paymentMethods],
  );

  const totalCassa = totalAccountsBalance + totalPaymentMethodsBalance;

  useEffect(() => {
    if (!createPlayerId) {
      queueMicrotask(() => {
        setMethodsForSelectedPlayer([]);
        setAccountsForCreatePlayer([]);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMethodsPlayerLoading(true);
    });
    void (async () => {
      const [gaRes, pmRes] = await Promise.all([
        supabase
          .from("gaming_accounts")
          .select(
            `
            id,
            account_name,
            bookmaker,
            bookmaker_id,
            bookmakers ( name )
          `,
          )
          .eq("player_id", createPlayerId)
          .order("account_name"),
        supabase
          .from("payment_methods")
          .select(
            `
            id,
            label,
            method_name,
            balance,
            player_id,
            identity_id,
            note,
            "type"
          `,
          )
          .eq("player_id", createPlayerId)
          .order("method_name"),
      ]);
      if (cancelled) return;
      if (gaRes.error) {
        setAccountsForCreatePlayer([]);
      } else {
        setAccountsForCreatePlayer((gaRes.data as GamingAccountBrief[]) ?? []);
      }
      if (pmRes.error) {
        setMethodsForSelectedPlayer([]);
      } else {
        setMethodsForSelectedPlayer((pmRes.data as unknown as PaymentMethodRow[]) ?? []);
      }
      setMethodsPlayerLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [createPlayerId, supabase]);

  function openEdit(a: AccountListRow) {
    setEditing(a);
    setEditName(a.account_name);
    setEditBookmakerId(a.bookmaker_id ?? "");
    setEditBookmakerLegacy(
      a.bookmaker_id ? "" : (a.bookmaker ?? "").trim(),
    );
    setEditNote(a.note ?? "");
    setEditStatus(a.account_status ?? "active");
    setEditError(null);
    setEditOpen(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const name = editName.trim();
    if (!name) {
      setEditError("Il nome conto è obbligatorio.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const patch: Record<string, unknown> = {
      account_name: name,
      note: editNote.trim() ? editNote.trim() : null,
      account_status: editStatus,
    };
    if (editBookmakerId) {
      patch.bookmaker_id = editBookmakerId;
    } else {
      patch.bookmaker_id = null;
      patch.bookmaker = editBookmakerLegacy.trim();
    }
    const { error } = await supabase.from("gaming_accounts").update(patch).eq("id", editing.id);
    setEditSaving(false);
    if (error) {
      console.error("[conti] modifica conto", error);
      setEditError(error.message);
      return;
    }
    setEditOpen(false);
    setEditing(null);
    if (userId) await loadData(userId);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleteLoading(true);
    const { error } = await supabase
      .from("gaming_accounts")
      .delete()
      .eq("id", deleteTarget.id);
    setDeleteLoading(false);
    if (error) {
      console.error("[conti] elimina conto", error);
      setDeleteError(error.message);
      return;
    }
    setDeleteTarget(null);
    if (userId) await loadData(userId);
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!createPlayerId) {
      setCreateError("Seleziona un'identità.");
      return;
    }
    const name = createAccountName.trim();
    if (!name) {
      setCreateError("Il nome conto è obbligatorio.");
      return;
    }
    const initial = parseAmount(createInitialStr);
    if (Number.isNaN(initial) || initial < 0) {
      setCreateError("Saldo iniziale non valido (numero ≥ 0).");
      return;
    }
    if (!createBookmakerId) {
      setCreateError("Seleziona un bookmaker.");
      return;
    }
    setCreateSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCreateSubmitting(false);
      return;
    }
    const { error } = await supabase.from("gaming_accounts").insert({
      user_id: user.id,
      player_id: createPlayerId,
      identity_id: createPlayerId,
      account_name: name,
      bookmaker_id: createBookmakerId,
      bookmaker: "",
      initial_balance: initial,
      current_balance: initial,
      note: createNote.trim() ? createNote.trim() : null,
      account_status: createStatus,
    });
    setCreateSubmitting(false);
    if (error) {
      console.error("[conti] crea conto", error);
      setCreateError(error.message);
      return;
    }
    setCreateAccountName("");
    setCreateBookmakerId("");
    setCreateInitialStr("");
    setCreateNote("");
    setCreateStatus("active");
    setCreateOpen(false);
    if (userId) await loadData(userId);
  }

  const hasPageContent =
    accounts.length > 0 || paymentMethods.length > 0 || players.length > 0;

  return (
    <AuthGate>
      <AppShell title="Conti">
        <PageLoadGate
          ready={ready}
          loadError={displayLoadError}
          onRetry={retryPageLoad}
          hasContent={hasPageContent}
          skeletonCount={6}
        >
      <div className="sticky top-12 z-[25] -mx-2.5 mb-1.5 border-b border-white/[0.06] bg-[#0A1020]/95 px-2.5 py-1.5 backdrop-blur-md sm:top-14 sm:-mx-4 sm:mb-2 sm:px-4 sm:py-2">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Cerca conto o bookmaker..."
        />
      </div>

      <section className="mb-2 grid grid-cols-3 gap-2 sm:mb-2 sm:gap-1.5">
        <StatPill
          className="!px-2 !py-1.5"
          label="Conti"
          value={`${formatMoney(totalAccountsBalance)} €`}
          tone={totalAccountsBalance >= 0 ? "default" : "negative"}
        />
        <StatPill
          className="!px-2 !py-1.5"
          label="Metodi"
          value={`${formatMoney(totalPaymentMethodsBalance)} €`}
          tone={totalPaymentMethodsBalance >= 0 ? "default" : "negative"}
        />
        <StatPill
          className="!px-2 !py-1.5"
          label="Cassa"
          value={`${formatMoney(totalCassa)} €`}
          tone={totalCassa >= 0 ? "accent" : "negative"}
        />
      </section>

      <div className="mb-2 flex flex-wrap gap-2 sm:mb-2 sm:gap-2">
        <QuickActionButton variant="primary" onClick={() => setCreateOpen(true)}>
          + Conto
        </QuickActionButton>
        <QuickActionButton href="/transactions" variant="ghost">
          Movimenti
        </QuickActionButton>
        <QuickActionButton href="/bookmakers" variant="ghost">
          Bookmakers
        </QuickActionButton>
      </div>

      <BottomSheet
        open={createOpen}
        title="Nuovo conto"
        dismissDisabled={createSubmitting}
        onClose={() => {
          if (!createSubmitting) setCreateOpen(false);
        }}
      >
        <form className="grid gap-2" onSubmit={(e) => void handleCreateAccount(e)}>
          <div className="space-y-1">
            <label className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
              Identità
            </label>
            <select
              required
              value={createPlayerId}
              onChange={(e) => setCreatePlayerId(e.target.value)}
              className="sm-input"
            >
              <option value="">—</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-[#1E2838] bg-[#131C31] px-2 py-2 sm:rounded-xl sm:px-3 sm:py-3">
            {!createPlayerId ? (
              <p className="text-sm sm:text-xs text-[#8B93A7]">Seleziona identità.</p>
            ) : methodsPlayerLoading ? (
              <p className="text-sm sm:text-xs text-[#8B93A7]">Caricamento…</p>
            ) : (
              <>
                <p className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]">
                  Conti
                </p>
                {accountsForCreatePlayer.length === 0 ? (
                  <p className="mt-2 text-sm sm:text-sm text-[#8B93A7]">Nessun conto ancora per questo player.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm sm:text-xs text-[#B4BCCC]">
                    {accountsForCreatePlayer.map((ga) => (
                      <li key={ga.id} className="truncate">
                        {ga.account_name}
                        {gamingAccountBookmakerDisplay(ga)
                          ? ` · ${gamingAccountBookmakerDisplay(ga)}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                )}
                  <p className="mt-3 text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]">
                  Metodi
                </p>
                {methodsForSelectedPlayer.length === 0 ? (
                  <p className="mt-2 text-sm sm:text-sm text-[#8B93A7]">Nessun metodo pagamento</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm sm:text-xs text-[#B4BCCC]">
                    {methodsForSelectedPlayer.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span className="truncate">{paymentMethodTitle(m)}</span>
                        <span className="shrink-0 tabular-nums text-[#8B93A7]">
                          {formatMoney(m.balance)} €
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
                Nome conto
              </label>
              <input
                value={createAccountName}
                onChange={(e) => setCreateAccountName(e.target.value)}
                required
                className="sm-input"
                placeholder="Es. Conto principale"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
                Bookmaker
              </label>
              <select
                required
                value={createBookmakerId}
                onChange={(e) => setCreateBookmakerId(e.target.value)}
                className="sm-input"
              >
                <option value="">—</option>
                {bookmakers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {bookmakers.length === 0 ? (
                <p className="text-sm sm:text-xs text-[#8B93A7]">
                  <Link href="/bookmakers" className="text-[#A970FF] underline-offset-2 hover:underline">
                    Aggiungi bookmakers
                  </Link>
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
                Saldo iniziale
              </label>
              <input
                value={createInitialStr}
                onChange={(e) => setCreateInitialStr(e.target.value)}
                required
                inputMode="decimal"
                className="sm-input"
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
                Stato conto
              </label>
              <select
                value={createStatus}
                onChange={(e) =>
                  setCreateStatus(e.target.value as GamingAccountStatus)
                }
                className="sm-input"
              >
                <option value="active">Attivo</option>
                <option value="paused">In pausa</option>
                <option value="closed">Chiuso</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
              Note
            </label>
            <textarea
              rows={2}
              value={createNote}
              onChange={(e) => setCreateNote(e.target.value)}
              className="sm-input"
              placeholder="Opzionale"
            />
          </div>
          {createError ? (
            <p
              className="rounded-lg border border-[#fb7185]/40 bg-[#fb7185]/10 px-2.5 py-1.5 text-sm text-[#fb7185] sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm"
              role="alert"
            >
              {createError}
            </p>
          ) : null}
          <button type="submit" disabled={createSubmitting} className="sm-btn-primary w-full rounded-full">
            {createSubmitting ? "Creazione…" : "Crea conto"}
          </button>
        </form>
      </BottomSheet>

      <section className="min-w-0">
        <h2 className="mb-2 text-sm sm:text-xs font-semibold uppercase tracking-[0.14em] text-[#8B93A7]">
          I tuoi conti
        </h2>
        {accounts.length === 0 && !loadError ? (
          <p className="rounded-2xl border border-dashed border-white/[0.06] bg-[#11182B] px-2 py-6 text-center text-xs sm:rounded-xl sm:px-3 sm:py-10 sm:text-xs text-[#8B93A7]">
            Nessun conto. Tocca + Conto per aggiungerne uno.
          </p>
        ) : filteredAccounts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/[0.06] bg-[#11182B] px-2 py-6 text-center text-xs sm:rounded-xl sm:px-3 sm:py-10 sm:text-xs text-[#8B93A7]">
            Nessun risultato
          </p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0 pb-2 sm:gap-2">
            {filteredAccounts.map((a) => {
              const bm = gamingAccountBookmakerDisplay(a);
              const idn = identityNameById.get(a.identity_id) ?? "—";
              const bal = Number.parseFloat(a.current_balance) || 0;
              const balCls =
                bal > 0
                  ? "text-emerald-400"
                  : bal === 0
                    ? "text-[#8B93A7]"
                    : "text-[#fb7185]";
              return (
                <li key={a.id} className="min-w-0">
                  <button type="button" onClick={() => setDetailAccount(a)} className={accListCardClass}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold leading-snug text-white sm:text-sm">
                          {a.account_name}
                          {bm ? (
                            <span className="font-medium text-[#8B93A7]">{` (${bm})`}</span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[#8B93A7] sm:text-xs">{idn}</p>
                      </div>
                      <p
                        className={`shrink-0 text-right text-base font-bold tabular-nums leading-none tracking-tight sm:text-xl ${balCls}`}
                      >
                        {formatMoney(a.current_balance)} €
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BottomSheet
        open={detailAccount !== null}
        title={detailAccount?.account_name.trim() || "Conto"}
        stackClassName="z-[95]"
        panelClassName="!max-w-[420px]"
        onClose={() => setDetailAccount(null)}
      >
        {detailAccount ? (
          <div className="mx-auto flex max-w-[360px] flex-col gap-2 pb-1 sm:gap-3">
            {(() => {
              const a = detailAccount;
              const bm = gamingAccountBookmakerDisplay(a);
              const idn = identityNameById.get(a.identity_id) ?? "—";
              const bal = Number.parseFloat(a.current_balance) || 0;
              const balCls =
                bal > 0
                  ? "text-emerald-400"
                  : bal === 0
                    ? "text-[#8B93A7]"
                    : "text-[#fb7185]";
              const st = a.account_status ?? "active";
              const accIdEnc = encodeURIComponent(a.id);
              return (
                <>
                  <div className="rounded-2xl border border-white/[0.06] bg-[#11182B]/60 px-2.5 py-2.5 text-center backdrop-blur-sm sm:rounded-xl sm:px-3 sm:py-4">
                    <p className="text-xs sm:text-xs font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:tracking-[0.14em]">
                      Saldo
                    </p>
                    <p className={`mt-0.5 whitespace-nowrap text-xl font-bold tabular-nums sm:text-3xl ${balCls}`}>
                      {formatMoney(a.current_balance)} €
                    </p>
                    <p className="mt-1.5 text-xs sm:text-xs text-[#8B93A7]">
                      {bm ? <span>{bm}</span> : null}
                      {bm ? <span className="text-[#6B7385]"> · </span> : null}
                      <span>{idn}</span>
                    </p>
                    <p className="mt-1 text-xs sm:text-xs font-medium uppercase tracking-wide text-[#8B93A7]">
                      {ACCOUNT_STATUS_LABEL[st]}
                    </p>
                  </div>
                  <Link
                    href={`/transactions?account=${accIdEnc}&type=deposit`}
                    className={`${accActionBtnClass} border-emerald-500/40 bg-emerald-500/12 text-emerald-100 hover:shadow-sm`}
                    onClick={() => setDetailAccount(null)}
                  >
                    Deposita
                  </Link>
                  <Link
                    href={`/transactions?account=${accIdEnc}&type=withdrawal`}
                    className={`${accActionBtnClass} border-amber-500/45 bg-amber-500/12 text-amber-100 hover:shadow-sm`}
                    onClick={() => setDetailAccount(null)}
                  >
                    Preleva
                  </Link>
                  <Link
                    href={`/transactions?account=${accIdEnc}`}
                    className={`${accActionBtnClass} border-white/[0.06] bg-[#151c2a] text-[#e2e8f0] hover:border-white/[0.12]`}
                    onClick={() => setDetailAccount(null)}
                  >
                    Movimenti
                  </Link>
                  <button
                    type="button"
                    className={`${accActionBtnClass} border-white/12 bg-transparent text-[#B4BCCC] hover:border-white/25 hover:bg-white/[0.04]`}
                    onClick={() => {
                      const row = a;
                      setDetailAccount(null);
                      openEdit(row);
                    }}
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    className={`${accActionBtnClass} border-red-500/35 bg-red-500/8 text-red-200 hover:border-red-400/45 hover:shadow-sm`}
                    onClick={() => {
                      setDetailAccount(null);
                      setDeleteTarget(a);
                    }}
                  >
                    Elimina
                  </button>
                </>
              );
            })()}
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={editOpen}
        title="Modifica conto"
        stackClassName="z-[100]"
        onClose={() => !editSaving && setEditOpen(false)}
        dismissDisabled={editSaving}
      >
        {editing ? (
          <form className="space-y-4" onSubmit={(e) => void handleSaveEdit(e)}>
            <div className="space-y-1.5">
              <label className="text-lg sm:text-base font-semibold uppercase tracking-[0.15em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
                Nome conto
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="sm-input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-lg sm:text-base font-semibold uppercase tracking-[0.15em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
                Bookmaker
              </label>
              <select
                value={editBookmakerId}
                onChange={(e) => setEditBookmakerId(e.target.value)}
                className="sm-input"
              >
                <option value="">Testo manuale (legacy)</option>
                {bookmakers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {!editBookmakerId ? (
                <input
                  value={editBookmakerLegacy}
                  onChange={(e) => setEditBookmakerLegacy(e.target.value)}
                  className="sm-input mt-2"
                  placeholder="Nome se non in elenco"
                />
              ) : null}
            </div>
            <div className="space-y-1.5">
              <label className="text-lg sm:text-base font-semibold uppercase tracking-[0.15em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
                Stato conto
              </label>
              <select
                value={editStatus}
                onChange={(e) =>
                  setEditStatus(e.target.value as GamingAccountStatus)
                }
                className="sm-input"
              >
                <option value="active">Attivo</option>
                <option value="paused">In pausa</option>
                <option value="closed">Chiuso</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-lg sm:text-base font-semibold uppercase tracking-[0.15em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
                Note
              </label>
              <textarea
                rows={3}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="sm-input"
              />
            </div>
            {editError ? (
              <p className="text-lg sm:text-sm text-[#fb7185]" role="alert">
                {editError}
              </p>
            ) : null}
            <button type="submit" disabled={editSaving} className="sm-btn-primary w-full rounded-full">
              {editSaving ? "Salvataggio…" : "Salva modifiche"}
            </button>
          </form>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminare il conto?"
        message={
          deleteTarget
            ? `Il conto «${deleteTarget.account_name}» verrà eliminato. I metodi collegati verranno rimossi (cascade). Se esistono transazioni collegate, l’operazione potrebbe fallire.`
            : ""
        }
        confirmText="Elimina"
        cancelText="Annulla"
        variant="danger"
        loading={deleteLoading}
        error={deleteError}
        onCancel={() => {
          if (!deleteLoading) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
        </PageLoadGate>
      </AppShell>
    </AuthGate>
  );
}
