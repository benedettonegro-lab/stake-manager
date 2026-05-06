"use client";

import { BottomSheet, QuickActionButton, SearchInput } from "@/components/app";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmakerCard, type BookmakerCardRow } from "./bookmaker-card";
import { FloatingActionButton } from "./floating-action-button";
function sortBookmakers(list: BookmakerCardRow[]): BookmakerCardRow[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
}

export default function BookmakersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<BookmakerCardRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<BookmakerCardRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<BookmakerCardRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /** Id ultimo inserito → animazione ingresso card */
  const [enterAnimId, setEnterAnimId] = useState<string | null>(null);
  /** Evidenziazione breve dopo salvataggio modifica */
  const [flashId, setFlashId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const { data, error } = await supabase
      .from("bookmakers")
      .select("*")
      .order("name", { ascending: true });
    if (error) {
      setLoadError(error.message);
      setRows([]);
      return;
    }
    const raw = (data ?? []) as BookmakerCardRow[];
    setRows(sortBookmakers(raw));
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    const { data: authSub } = supabase.auth.onAuthStateChange((ev) => {
      // DEBUG AUTH: disabilita redirect automatici
    });
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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((b) => {
      const nameOk = b.name.toLowerCase().includes(q);
      const noteOk = (b.note ?? "").toLowerCase().includes(q);
      return nameOk || noteOk;
    });
  }, [rows, searchQuery]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const n = name.trim();
    if (!n) {
      setFormError("Nome obbligatorio.");
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
    const { data: inserted, error } = await supabase
      .from("bookmakers")
      .insert({
        user_id: user.id,
        name: n,
        note: note.trim() ? note.trim() : null,
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setName("");
    setNote("");
    setAddOpen(false);
    if (inserted?.id) {
      setEnterAnimId(inserted.id);
      window.setTimeout(() => setEnterAnimId(null), 550);
    }
    await load();
  }

  function openEdit(b: BookmakerCardRow) {
    setEditing(b);
    setEditName(b.name);
    setEditNote(b.note ?? "");
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
    setEditSaving(true);
    setEditError(null);
    const { error } = await supabase
      .from("bookmakers")
      .update({
        name: n,
        note: editNote.trim() ? editNote.trim() : null,
      })
      .eq("id", editing.id);
    setEditSaving(false);
    if (error) {
      setEditError(error.message);
      return;
    }
    const id = editing.id;
    setEditing(null);
    setFlashId(id);
    window.setTimeout(() => setFlashId(null), 900);
    await load();
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleteLoading(true);
    const { error } = await supabase.from("bookmakers").delete().eq("id", deleteTarget.id);
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
      <AppShell title="Bookmakers">
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-[#94a3b8]">
          Caricamento…
        </div>
      </AppShell>
    );
  }

  const emptyDb = rows.length === 0 && !loadError;
  const emptyFilter = rows.length > 0 && filtered.length === 0;

  return (
    <AppShell title="Bookmakers">
      <div className="sticky top-14 z-[25] -mx-3 mb-3 border-b border-[#1a1f2e] bg-[#050816]/95 px-3 py-2.5 backdrop-blur-md">
        <SearchInput value={searchQuery} onChange={setSearchQuery} />
      </div>

      {loadError ? (
        <p className="mb-3 rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-xs text-[#fb7185]">
          {loadError}
        </p>
      ) : null}

      {emptyDb ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#273449] bg-[#0c101c]/80 px-6 py-14 pb-28 text-center">
          <div
            className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#334155] bg-[#111827] text-[#64748b]"
            aria-hidden
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19h16M6 16h12M8 5h8l2 11H6L8 5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#94a3b8]">Nessun bookmaker</p>
          <p className="mt-2 text-[11px] text-[#475569]">Oppure usa il pulsante + in basso.</p>
          <QuickActionButton variant="primary" className="mt-4" onClick={() => setAddOpen(true)}>
            Aggiungi
          </QuickActionButton>
        </div>
      ) : emptyFilter ? (
        <p className="rounded-xl border border-dashed border-[#273449] py-10 text-center text-xs text-[#64748b]">
          Nessun risultato per «{searchQuery.trim()}»
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0 pb-24">
          {filtered.map((b) => (
            <li key={b.id}>
              <BookmakerCard
                bookmaker={b}
                onEdit={openEdit}
                onDelete={(row) => {
                  setDeleteError(null);
                  setDeleteTarget(row);
                }}
                highlight={flashId === b.id}
                enterAnimation={enterAnimId === b.id}
              />
            </li>
          ))}
        </ul>
      )}

      <FloatingActionButton onClick={() => setAddOpen(true)} label="Aggiungi bookmaker" />

      <BottomSheet
        open={addOpen}
        title="Nuovo bookmaker"
        dismissDisabled={submitting}
        onClose={() => {
          if (!submitting) {
            setAddOpen(false);
            setFormError(null);
          }
        }}
      >
        <form className="flex flex-col gap-3" onSubmit={(e) => void handleAdd(e)}>
          <div className="space-y-1">
            <label htmlFor="bm-new-name" className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
              Nome
            </label>
            <input
              id="bm-new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Es. Snai"
              className="sm-input min-h-11 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="bm-new-note" className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
              Note <span className="font-normal normal-case text-[#475569]">(opzionale)</span>
            </label>
            <textarea
              id="bm-new-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Promo, note interne…"
              className="sm-input min-h-[5.5rem] text-sm"
            />
          </div>
          {formError ? <p className="text-xs text-[#fb7185]">{formError}</p> : null}
          <button type="submit" disabled={submitting} className="sm-btn-primary min-h-12 w-full rounded-full text-base font-semibold">
            {submitting ? "Salvataggio…" : "Salva"}
          </button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={editing !== null}
        title="Modifica bookmaker"
        dismissDisabled={editSaving}
        onClose={() => {
          if (!editSaving) setEditing(null);
        }}
      >
        <form className="flex flex-col gap-3" onSubmit={(e) => void handleSaveEdit(e)}>
          <div className="space-y-1">
            <label htmlFor="bm-edit-name" className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
              Nome
            </label>
            <input
              id="bm-edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              className="sm-input min-h-11 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="bm-edit-note" className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
              Note <span className="font-normal normal-case text-[#475569]">(opzionale)</span>
            </label>
            <textarea
              id="bm-edit-note"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={3}
              className="sm-input min-h-[5.5rem] text-sm"
            />
          </div>
          {editError ? <p className="text-xs text-[#fb7185]">{editError}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={editSaving}
              onClick={() => setEditing(null)}
              className="h-12 flex-1 rounded-full border border-[#334155] text-sm font-semibold text-[#e2e8f0] transition active:scale-[0.98]"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={editSaving}
              className="sm-btn-primary h-12 flex-1 rounded-full text-sm font-semibold"
            >
              {editSaving ? "…" : "Salva"}
            </button>
          </div>
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminare bookmaker?"
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
