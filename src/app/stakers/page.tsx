"use client";

import { BottomSheet, QuickActionButton, SearchInput, StatPill } from "@/components/app";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { betBalanceContribution } from "@/lib/bet-balance-effect";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  if (totalStake <= 0 || Number.isNaN(totalStake)) return "—";
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

export default function StakersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<StakerRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [name, setName] = useState("");
  const [balStr, setBalStr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<StakerRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editBalStr, setEditBalStr] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<StakerRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [betRows, setBetRows] = useState<BetMini[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const [sRes, bRes] = await Promise.all([
      supabase.from("stakers").select("id, name, balance, player_id").order("name"),
      supabase.from("bets").select("staker_id, stake, profit, status, odds"),
    ]);
    if (sRes.error) {
      setLoadError(sRes.error.message);
      setRows([]);
      setBetRows([]);
      return;
    }
    setRows((sRes.data as StakerRow[]) ?? []);
    if (bRes.error) {
      setBetRows([]);
    } else {
      setBetRows((bRes.data as BetMini[]) ?? []);
    }
  }, [supabase]);

  const aggByStaker = useMemo(() => {
    const m = new Map<string, { count: number; stake: number; profit: number }>();
    for (const r of betRows) {
      const prev = m.get(r.staker_id) ?? { count: 0, stake: 0, profit: 0 };
      prev.count += 1;
      prev.stake += Number.parseFloat(r.stake) || 0;
      prev.profit += betBalanceContribution(r.status, r.stake, r.odds, r.profit);
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const n = name.trim();
    if (!n) {
      setFormError("Nome obbligatorio.");
      return;
    }
    const bal = Number.parseFloat(balStr.replace(",", "."));
    if (Number.isNaN(bal)) {
      setFormError("Saldo non valido.");
      return;
    }
    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      return;
    }
    const { error } = await supabase.from("stakers").insert({
      user_id: user.id,
      name: n,
      balance: bal,
      player_id: null,
    });
    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setName("");
    setBalStr("");
    setAddOpen(false);
    await load();
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
    const { error } = await supabase
      .from("stakers")
      .update({ name: n, balance: bal })
      .eq("id", editing.id);
    setEditSaving(false);
    if (error) {
      setEditError(error.message);
      return;
    }
    setEditing(null);
    await load();
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleteLoading(true);
    const { error } = await supabase.from("stakers").delete().eq("id", deleteTarget.id);
    setDeleteLoading(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    setDeleteTarget(null);
    await load();
  }

  if (!ready) {
    return (
      <AppShell title="Staker">
        <div className="flex min-h-[30vh] items-center justify-center text-[16px] text-[#8B93A7] sm:text-sm">
          Caricamento…
        </div>
      </AppShell>
    );
  }

  return (
    <AuthGate>
      <AppShell title="Staker">
        {loadError ? (
          <p className="mb-4 rounded-lg border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2.5 text-[16px] text-[#fb7185] sm:mb-3 sm:py-2 sm:text-xs">
            {loadError}
          </p>
        ) : null}

      <div className="sticky top-12 z-[25] -mx-2.5 mb-2 border-b border-white/[0.06] bg-[#0A1020]/95 px-2.5 py-1.5 backdrop-blur-md sm:top-14 sm:-mx-4 sm:mb-3 sm:px-4 sm:py-2.5">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Cerca staker..."
        />
      </div>

      <div className="mb-3 sm:mb-3">
        <QuickActionButton variant="primary" onClick={() => setAddOpen(true)}>
          + Staker
        </QuickActionButton>
      </div>

      <BottomSheet
        open={addOpen}
        title="Nuovo staker"
        dismissDisabled={submitting}
        onClose={() => {
          if (!submitting) setAddOpen(false);
        }}
      >
        <form onSubmit={(e) => void handleAdd(e)} className="flex flex-col gap-4 sm:gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome"
            className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
          />
          <input
            value={balStr}
            onChange={(e) => setBalStr(e.target.value)}
            placeholder="Saldo iniziale"
            inputMode="decimal"
            className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
          />
          {formError ? <p className="text-sm sm:text-xs text-[#fb7185]">{formError}</p> : null}
          <button type="submit" disabled={submitting} className="sm-btn-primary w-full rounded-full">
            {submitting ? "…" : "Crea"}
          </button>
        </form>
      </BottomSheet>

      {rows.length === 0 && !loadError ? (
        <p className="rounded-xl border border-dashed border-white/[0.06] py-10 text-center text-[16px] text-[#8B93A7] sm:py-8 sm:text-xs">
          Nessuno staker. Tocca + Staker.
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/[0.06] py-12 text-center text-[16px] text-[#8B93A7] sm:py-10 sm:text-xs">
          Nessun risultato
        </p>
      ) : (
        <ul className="flex flex-col gap-2 sm:gap-2">
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
                className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#11182B] shadow-sm transition hover:border-white/[0.06]"
              >
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="w-full px-2.5 pb-2 pt-2 text-left transition active:bg-[#11182B]/80 sm:px-3 sm:pb-2 sm:pt-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold leading-snug text-white sm:text-sm sm:font-semibold">
                        {s.name}
                      </p>
                      {locked ? (
                        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:mt-0.5 sm:text-xs sm:font-normal sm:tracking-normal sm:normal-case">
                          Legato identità
                        </p>
                      ) : null}
                    </div>
                    <p className={`shrink-0 whitespace-nowrap text-xl font-bold tabular-nums sm:text-base sm:font-bold ${toneClass(b)}`}>
                      {formatMoney(s.balance)} €
                    </p>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-[#8B93A7] sm:hidden">
                    <span className="font-semibold tabular-nums text-[#E6EAF2]">{g.count}</span> giocate
                    <span className="mx-1 text-[#4B5563]">·</span>
                    <span>
                      P/L{" "}
                      <span
                        className={
                          g.profit > 0
                            ? "font-semibold tabular-nums text-[#34d399]"
                            : g.profit < 0
                              ? "font-semibold tabular-nums text-[#fb7185]"
                              : "font-semibold tabular-nums text-[#E6EAF2]"
                        }
                      >
                        {g.profit >= 0 ? "+" : ""}
                        {formatMoney(g.profit)} €
                      </span>
                    </span>
                    <span className="mx-1 text-[#4B5563]">·</span>
                    <span>
                      ROI{" "}
                      <span
                        className={
                          g.stake <= 0
                            ? "font-semibold tabular-nums text-[#8B93A7]"
                            : g.profit > 0
                              ? "font-semibold tabular-nums text-[#34d399]"
                              : g.profit < 0
                                ? "font-semibold tabular-nums text-[#fb7185]"
                                : "font-semibold tabular-nums text-[#E6EAF2]"
                        }
                      >
                        {roi}
                      </span>
                    </span>
                  </p>
                  <div className="mt-2 hidden grid-cols-3 gap-1 sm:mt-2 sm:grid sm:gap-1.5">
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
                <div className="flex flex-wrap gap-1.5 border-t border-[#141C2A] px-2.5 py-2 sm:gap-1.5 sm:px-2.5 sm:py-2">
                  <QuickActionButton
                    onClick={() => openEdit(s)}
                    variant="ghost"
                    className="min-h-9 px-3 text-xs sm:min-h-8 sm:px-3 sm:text-xs"
                  >
                    Modifica
                  </QuickActionButton>
                  <QuickActionButton
                    variant="danger"
                    className="min-h-9 px-3 text-xs sm:min-h-8 sm:px-3 sm:text-xs"
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
          {editError ? <p className="text-sm sm:text-xs text-[#fb7185]">{editError}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={editSaving}
              onClick={() => setEditing(null)}
              className="flex min-h-9 flex-1 items-center justify-center rounded-full border border-white/[0.06] text-sm font-semibold text-[#e2e8f0] sm:h-10 sm:min-h-0 sm:text-sm"
            >
              Annulla
            </button>
            <button type="submit" disabled={editSaving} className="sm-btn-primary flex-1 rounded-full">
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
      </AppShell>
    </AuthGate>
  );
}
