"use client";

import { BottomSheet, QuickActionButton, SearchInput, StatPill } from "@/components/app";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FloatingActionButton } from "@/components/floating-action-button";
import { PageLoadGate } from "@/components/ui/page-load-gate";
import { betIsSettled, betSettledPnL } from "@/lib/bet-balance-effect";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { usePageLoad } from "@/hooks/use-page-load";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

type StakerRow = {
  id: string;
  name: string;
  balance: string;
  player_id: string | null;
};

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function toneClass(n: number): string {
  if (n > 0) return "text-[#34d399]";
  if (n < 0) return "text-[#fb7185]";
  return "text-[#8B93A7]";
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

type BetMini = {
  staker_id: string;
  stake: string;
  profit: string;
  status: string;
  odds: string | number;
};

function sortStakers(list: StakerRow[]): StakerRow[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "it"));
}

function StakersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [rows, setRows] = useState<StakerRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const [editing, setEditing] = useState<StakerRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editBalStr, setEditBalStr] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<StakerRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [betRows, setBetRows] = useState<BetMini[]>([]);

  const openAddModal = useCallback(() => {
    setFormError(null);
    setName("");
    setAddOpen(true);
  }, []);

  const closeAddModal = useCallback(() => {
    if (submitting) return;
    setAddOpen(false);
    setFormError(null);
    if (searchParams.get("nuovo") === "1") {
      router.replace("/stakers", { scroll: false });
    }
  }, [router, searchParams, submitting]);

  useEffect(() => {
    queueMicrotask(() => {
      if (searchParams.get("nuovo") === "1") openAddModal();
    });
  }, [searchParams, openAddModal]);

  const load = useCallback(async () => {
    setLoadError(null);
    const [sRes, bRes] = await Promise.all([
      supabase.from("stakers").select("id, name, balance, player_id").order("name"),
      supabase.from("bets").select("staker_id, stake, profit, status, odds"),
    ]);
    if (sRes.error) {
      const msg = sRes.error.message;
      setLoadError(msg);
      setRows([]);
      setBetRows([]);
      throw new Error(msg);
    }
    setRows((sRes.data as StakerRow[]) ?? []);
    if (bRes.error) {
      setBetRows([]);
    } else {
      setBetRows((bRes.data as BetMini[]) ?? []);
    }
  }, [supabase]);

  const {
    ready,
    userId,
    loadError: pageLoadError,
    retry: retryPageLoad,
  } = usePageLoad({
    page: "stakers",
    fetch: async () => {
      await load();
    },
  });

  const displayLoadError = pageLoadError ?? loadError;

  const aggByStaker = useMemo(() => {
    const m = new Map<string, { count: number; stake: number; profit: number }>();
    for (const r of betRows) {
      const prev = m.get(r.staker_id) ?? { count: 0, stake: 0, profit: 0 };
      prev.count += 1;
      prev.profit += betSettledPnL(r.status, r.stake, r.odds, r.profit);
      if (betIsSettled(r.status)) {
        prev.stake += Number.parseFloat(r.stake) || 0;
      }
      m.set(r.staker_id, prev);
    }
    return m;
  }, [betRows]);

  const filteredRows = useMemo(() => {
    const raw = searchQuery.trim();
    if (!raw) return rows;
    const q = raw.toLowerCase();
    return rows.filter((s) => s.name.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const n = name.trim();
    if (!n) {
      setFormError("Inserisci il nome dello staker.");
      return;
    }

    setSubmitting(true);
    try {
      const uid =
        userId ??
        (
          await supabase.auth.getUser()
        ).data.user?.id;
      if (!uid) {
        setFormError("Sessione scaduta. Accedi di nuovo.");
        return;
      }

      const { data, error } = await supabase
        .from("stakers")
        .insert({
          user_id: uid,
          name: n,
          balance: 0,
          player_id: null,
        })
        .select("id, name, balance, player_id")
        .single();

      if (error) {
        setFormError(error.message);
        return;
      }

      if (data) {
        setRows((prev) => sortStakers([...prev, data as StakerRow]));
      }

      setName("");
      setAddOpen(false);
      router.replace("/stakers", { scroll: false });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Impossibile creare lo staker.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(s: StakerRow) {
    setEditing(s);
    setEditName(s.name);
    setEditBalStr(String(Number.parseFloat(s.balance) || 0).replace(".", ","));
    setEditError(null);
  }

  async function handleSaveEdit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editing) return;
    const n = editName.trim();
    if (!n) {
      setEditError("Nome obbligatorio.");
      return;
    }
    const bal = Number.parseFloat(editBalStr.replace(",", "."));
    if (Number.isNaN(bal)) {
      setEditError("Saldo non valido.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const { data, error } = await supabase
        .from("stakers")
        .update({ name: n, balance: bal })
        .eq("id", editing.id)
        .select("id, name, balance, player_id")
        .single();
      if (error) {
        setEditError(error.message);
        return;
      }
      if (data) {
        setRows((prev) =>
          sortStakers(
            prev.map((r) => (r.id === editing.id ? (data as StakerRow) : r)),
          ),
        );
      }
      setEditing(null);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      const { error } = await supabase.from("stakers").delete().eq("id", deleteTarget.id);
      if (error) {
        setDeleteError(error.message);
        return;
      }
      const removedId = deleteTarget.id;
      setDeleteTarget(null);
      setRows((prev) => prev.filter((r) => r.id !== removedId));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <AppShell title="Staker">
      <div className="sm-page-search-sticky backdrop-blur-md sm:-mx-4 sm:px-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Cerca staker..."
        />
      </div>

      <div className="sm-page-block-after-search sm:mb-3">
        <QuickActionButton variant="primary" onClick={openAddModal}>
          + Staker
        </QuickActionButton>
      </div>

      <PageLoadGate
        ready={ready}
        loadError={displayLoadError}
        onRetry={retryPageLoad}
        hasContent={rows.length > 0}
        skeletonCount={4}
      >
        {rows.length === 0 && !displayLoadError ? (
          <p className="rounded-xl border border-dashed border-white/[0.06] py-6 text-center text-sm text-[#8B93A7] sm:py-8">
            Nessuno staker. Tocca + Staker per aggiungerne uno.
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/[0.06] py-6 text-center text-sm text-[#8B93A7] sm:py-8">
            Nessun risultato per la ricerca.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filteredRows.map((s) => {
              const b = Number.parseFloat(s.balance) || 0;
              const locked = s.player_id !== null;
              const g = aggByStaker.get(s.id) ?? { count: 0, stake: 0, profit: 0 };
              const roi = formatRoi(g.profit, g.stake);
              const roiTone =
                g.stake <= 0
                  ? ("default" as const)
                  : g.profit > 0
                    ? ("positive" as const)
                    : g.profit < 0
                      ? ("negative" as const)
                      : ("default" as const);
              return (
                <li
                  key={s.id}
                  className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#11182B] shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="w-full px-2.5 pb-2 pt-2 text-left transition active:bg-[#11182B]/80 sm:px-3 sm:pt-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold leading-snug text-white sm:text-sm">
                          {s.name}
                        </p>
                        {locked ? (
                          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#8B93A7]">
                            Legato identità
                          </p>
                        ) : null}
                      </div>
                      <p
                        className={`shrink-0 whitespace-nowrap text-lg font-bold tabular-nums sm:text-base ${toneClass(b)}`}
                      >
                        {formatMoney(s.balance)} €
                      </p>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-[#8B93A7] sm:hidden">
                      <span className="font-semibold tabular-nums text-[#E6EAF2]">{g.count}</span>{" "}
                      giocate · P/L{" "}
                      <span className={profitClass(g.profit)}>
                        {g.profit >= 0 ? "+" : ""}
                        {formatMoney(g.profit)} €
                      </span>{" "}
                      · ROI {roi}
                    </p>
                    <div className="mt-2 hidden grid-cols-3 gap-1 sm:grid">
                      <StatPill label="Giocate" value={String(g.count)} />
                      <StatPill
                        label="P/L"
                        value={`${g.profit >= 0 ? "+" : ""}${formatMoney(g.profit)}`}
                        tone={
                          g.profit > 0 ? "positive" : g.profit < 0 ? "negative" : "default"
                        }
                      />
                      <StatPill label="ROI" value={roi} tone={roiTone} />
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-1.5 border-t border-[#141C2A] px-2.5 py-2">
                    <QuickActionButton
                      onClick={() => openEdit(s)}
                      variant="ghost"
                      className="min-h-9 px-3 text-xs"
                    >
                      Modifica
                    </QuickActionButton>
                    <QuickActionButton
                      variant="danger"
                      className="min-h-9 px-3 text-xs"
                      disabled={locked}
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(s);
                      }}
                    >
                      Elimina
                    </QuickActionButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PageLoadGate>

      <BottomSheet
        open={addOpen}
        title="Nuovo staker"
        dismissDisabled={submitting}
        onClose={closeAddModal}
      >
        <form onSubmit={(e) => void handleAdd(e)} className="flex flex-col gap-3">
          <label className="sr-only" htmlFor="staker-name">
            Nome staker
          </label>
          <input
            id="staker-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome staker"
            autoComplete="off"
            className="sm-input min-h-11 text-base sm:text-sm"
            disabled={submitting}
          />
          {formError ? (
            <p className="text-sm text-[#fb7185]" role="alert">
              {formError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="sm-btn-primary w-full min-h-11 rounded-full disabled:opacity-50"
          >
            {submitting ? "Creazione…" : "Crea staker"}
          </button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={editing !== null}
        title="Modifica staker"
        dismissDisabled={editSaving}
        onClose={() => {
          if (!editSaving) setEditing(null);
        }}
      >
        <form className="space-y-3" onSubmit={(e) => void handleSaveEdit(e)}>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="sm-input"
            required
          />
          <input
            value={editBalStr}
            onChange={(e) => setEditBalStr(e.target.value)}
            inputMode="decimal"
            className="sm-input"
            required
          />
          {editError ? <p className="text-sm text-[#fb7185]">{editError}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={editSaving}
              onClick={() => setEditing(null)}
              className="flex min-h-10 flex-1 items-center justify-center rounded-full border border-white/[0.06] text-sm font-semibold text-[#e2e8f0]"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={editSaving}
              className="sm-btn-primary flex-1 rounded-full"
            >
              Salva
            </button>
          </div>
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminare?"
        message={deleteTarget ? deleteTarget.name : ""}
        confirmText="Elimina"
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

      <FloatingActionButton onClick={openAddModal} label="Nuovo staker" />
    </AppShell>
  );
}

function profitClass(profit: number): string {
  if (profit > 0) return "font-semibold tabular-nums text-[#34d399]";
  if (profit < 0) return "font-semibold tabular-nums text-[#fb7185]";
  return "font-semibold tabular-nums text-[#E6EAF2]";
}

export default function StakersPage() {
  return (
    <AuthGate>
      <Suspense
        fallback={
          <AppShell title="Staker">
            <p className="py-12 text-center text-sm text-[#8B93A7]">Caricamento…</p>
          </AppShell>
        }
      >
        <StakersPageContent />
      </Suspense>
    </AuthGate>
  );
}
