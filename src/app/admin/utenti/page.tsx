"use client";

import { FilterChips, SearchInput } from "@/components/app";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProfileRole = "admin" | "user";
type ProfileStatus = "pending" | "approved" | "blocked";

type ProfileRow = {
  id: string;
  email: string;
  role: ProfileRole;
  status: ProfileStatus;
  created_at: string;
};

type StatusFilter = "all" | ProfileStatus;

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "blocked", label: "Blocked" },
];

function statusBadgeClass(s: ProfileStatus): string {
  if (s === "approved") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (s === "pending") return "border-amber-500/35 bg-amber-950/40 text-[#fdba74]";
  return "border-[#5c3838] bg-[#2a2f38] text-[#9aa0a6]";
}

function roleBadgeClass(r: ProfileRole): string {
  if (r === "admin") return "border-[#a855f7]/45 bg-[#1a1428]/90 text-[#e9d5ff]";
  return "border-white/10 bg-[#121a28] text-[#94a3b8]";
}

function statusLabel(s: ProfileStatus): string {
  if (s === "approved") return "Approvato";
  if (s === "pending") return "In attesa";
  return "Bloccato";
}

function roleLabel(r: ProfileRole): string {
  return r === "admin" ? "Admin" : "User";
}

const btnOutline =
  "rounded-lg border border-[#273449] bg-[#0d1321] px-2 py-1.5 text-[11px] font-semibold text-[#e2e8f0] transition active:scale-[0.98] hover:border-[#475569] disabled:cursor-not-allowed disabled:opacity-40";

const btnPositive =
  "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-semibold text-emerald-200 transition active:scale-[0.98] hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40";

const btnDanger =
  "rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[11px] font-semibold text-rose-200 transition active:scale-[0.98] hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40";

const btnPurple =
  "rounded-lg border border-[#a855f7]/45 bg-[#a855f7]/10 px-2 py-1.5 text-[11px] font-semibold text-[#e9d5ff] transition active:scale-[0.98] hover:bg-[#a855f7]/20 disabled:cursor-not-allowed disabled:opacity-40";

export default function AdminUtentiPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [gateReady, setGateReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setListError(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, role, status, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setListError(
        `${error.message}${error.code ? ` (codice ${error.code})` : ""}. Se le policy RLS non consentono la lettura dell’elenco completo, serve un admin con permessi adeguati o una RPC dedicata.`,
      );
      setRows([]);
      return;
    }
    setRows((data ?? []) as ProfileRow[]);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        return;
      }

      setCurrentUserId(user.id);

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (cancelled) return;

      if (error || !profile || profile.role !== "admin") {
        return;
      }

      setGateReady(true);
      await loadProfiles();
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, router, loadProfiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return r.email.toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter]);

  async function patchProfile(id: string, patch: { status?: ProfileStatus; role?: ProfileRole }) {
    setActionError(null);
    setBusyId(id);
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    setBusyId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    await loadProfiles();
  }

  if (!gateReady) {
    return (
      <AuthGate>
        <AppShell title="Admin utenti">
          <p className="text-sm text-[#94a3b8]">Verifica permessi…</p>
        </AppShell>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <AppShell title="Admin utenti" subtitle="Approvazione e gestione utenti">
        <div className="flex flex-col gap-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Cerca per email…" />

          <FilterChips items={STATUS_CHIPS} value={statusFilter} onChange={setStatusFilter} />

          {listError ? (
            <p
              className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-sm text-[#fb7185]"
              role="alert"
            >
              {listError}
            </p>
          ) : null}

          {actionError ? (
            <p
              className="rounded-xl border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-sm text-[#fdba74]"
              role="alert"
            >
              {actionError}
            </p>
          ) : null}

          <ul className="flex list-none flex-col gap-3 p-0">
            {filtered.map((row) => {
              const isSelf = row.id === currentUserId;
              const busy = busyId === row.id;
              return (
                <li key={row.id}>
                  <div className="rounded-2xl border border-[#273449] bg-[#111827]/95 p-3 shadow-lg shadow-black/20 backdrop-blur-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{row.email || "—"}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(row.status)}`}
                          >
                            {statusLabel(row.status)}
                          </span>
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleBadgeClass(row.role)}`}
                          >
                            {roleLabel(row.role)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busy || row.status === "approved"}
                        className={btnPositive}
                        onClick={() => void patchProfile(row.id, { status: "approved" })}
                      >
                        Approva
                      </button>
                      <button
                        type="button"
                        disabled={busy || row.status === "blocked" || isSelf}
                        className={btnDanger}
                        onClick={() => void patchProfile(row.id, { status: "blocked" })}
                      >
                        Blocca
                      </button>
                      <button
                        type="button"
                        disabled={busy || row.status === "pending"}
                        className={btnOutline}
                        onClick={() => void patchProfile(row.id, { status: "pending" })}
                      >
                        In attesa
                      </button>
                      <button
                        type="button"
                        disabled={busy || row.role === "admin"}
                        className={btnPurple}
                        onClick={() => void patchProfile(row.id, { role: "admin" })}
                      >
                        Admin
                      </button>
                      <button
                        type="button"
                        disabled={busy || row.role === "user" || isSelf}
                        className={btnOutline}
                        onClick={() => void patchProfile(row.id, { role: "user" })}
                      >
                        User
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {!listError && filtered.length === 0 ? (
            <p className="text-center text-sm text-[#64748b]">Nessun utente in questo filtro.</p>
          ) : null}
        </div>
      </AppShell>
    </AuthGate>
  );
}
