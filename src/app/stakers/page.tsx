"use client";

import { BottomSheet, QuickActionButton, SearchInput, StatPill } from "@/components/app";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
  return "text-[#94a3b8]";
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

type BetMini = { staker_id: string; stake: string; profit: string };

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
      supabase.from("bets").select("staker_id, stake, profit"),
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
      prev.profit += Number.parseFloat(r.profit) || 0;
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
      router.replace("/login");
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
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-[#94a3b8]">
          Caricamento…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Staker">
      {loadError ? (
        <p className="mb-3 rounded-lg border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-xs text-[#fb7185]">
          {loadError}
        </p>
      ) : null}

      <div className="sticky top-14 z-[25] -mx-3 mb-3 border-b border-[#1a1f2e] bg-[#050816]/95 px-3 py-2.5 backdrop-blur-md">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Cerca staker..."
        />
      </div>

      <div className="mb-3">
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
        <form onSubmit={(e) => void handleAdd(e)} className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome"
            className="sm-input min-h-10 text-sm"
          />
          <input
            value={balStr}
            onChange={(e) => setBalStr(e.target.value)}
            placeholder="Saldo iniziale"
            inputMode="decimal"
            className="sm-input min-h-10 text-sm"
          />
          {formError ? <p className="text-xs text-[#fb7185]">{formError}</p> : null}
          <button type="submit" disabled={submitting} className="sm-btn-primary w-full rounded-full">
            {submitting ? "…" : "Crea"}
          </button>
        </form>
      </BottomSheet>

      {rows.length === 0 && !loadError ? (
        <p className="rounded-xl border border-dashed border-[#273449] py-8 text-center text-xs text-[#94a3b8]">
          Nessuno staker. Tocca + Staker.
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#273449] py-10 text-center text-xs text-[#64748b]">
          Nessun risultato
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
                className="overflow-hidden rounded-2xl border border-[#1e293b] bg-[#0c101c] shadow-sm transition hover:border-[#334155]"
              >
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="w-full px-3 pb-2 pt-3 text-left transition active:bg-[#111827]/80"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{s.name}</p>
                      {locked ? (
                        <p className="mt-0.5 text-[9px] text-[#64748b]">Legato identità</p>
                      ) : null}
                    </div>
                    <p className={`shrink-0 text-base font-bold tabular-nums ${toneClass(b)}`}>
                      {formatMoney(s.balance)} €
                    </p>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
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
                <div className="flex flex-wrap gap-1.5 border-t border-[#1a2230] px-2.5 py-2">
                  <QuickActionButton
                    onClick={() => openEdit(s)}
                    variant="ghost"
                    className="min-h-8 px-3 text-[10px]"
                  >
                    Modifica
                  </QuickActionButton>
                  <QuickActionButton
                    variant="danger"
                    className="min-h-8 px-3 text-[10px]"
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
          {editError ? <p className="text-xs text-[#fb7185]">{editError}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={editSaving}
              onClick={() => setEditing(null)}
              className="h-10 flex-1 rounded-full border border-[#334155] text-sm font-semibold text-[#e2e8f0]"
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
  );
}
