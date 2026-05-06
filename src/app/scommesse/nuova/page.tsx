"use client";

import { AppShell } from "@/components/app-shell";
import { BET_TYPE_DEFAULT } from "@/lib/bet-constants";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import { assertGamingAccountCoversStake } from "@/lib/balance-validation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export type BetStatus = "open" | "won" | "lost" | "void" | "cashout";

const BET_STATUSES: { value: BetStatus; label: string }[] = [
  { value: "open", label: "Aperta" },
  { value: "won", label: "Vinta" },
  { value: "lost", label: "Persa" },
  { value: "void", label: "Annullata (void)" },
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

function previewProfit(
  status: BetStatus,
  stake: number,
  odds: number,
): number {
  if (status === "won") {
    return Math.round((stake * odds - stake) * 1e4) / 1e4;
  }
  if (status === "lost") return Math.round(-stake * 1e4) / 1e4;
  if (status === "void" || status === "cashout" || status === "open") return 0;
  return 0;
}

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function NuovaScommessaPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [ready, setReady] = useState(false);
  const [stakers, setStakers] = useState<StakerRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accountId, setAccountId] = useState("");
  const [stakerId, setStakerId] = useState("");
  const [eventName, setEventName] = useState("");
  const [oddsStr, setOddsStr] = useState("");
  const [stakeStr, setStakeStr] = useState("");
  const [status, setStatus] = useState<BetStatus>("open");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
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
      await loadData();
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [loadData, router, supabase]);

  useEffect(() => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc || stakers.length === 0) return;
    const def = stakers.find((s) => s.player_id === acc.player_id);
    if (def) setStakerId(def.id);
    else if (stakers[0]) setStakerId(stakers[0].id);
  }, [accountId, accounts, stakers]);

  const oddsNum = Number.parseFloat(oddsStr.replace(",", "."));
  const stakeNum = Number.parseFloat(stakeStr.replace(",", "."));

  const newBetStakeExceedsBalanceNuova = useMemo(() => {
    const s = Number.parseFloat(stakeStr.replace(",", "."));
    const stakeOk = Number.isFinite(s) && s > 0;
    const a = accounts.find((x) => x.id === accountId);
    const bal = a ? Number.parseFloat(a.current_balance) || 0 : NaN;
    return (
      stakeOk && Boolean(accountId) && Number.isFinite(bal) && s > bal
    );
  }, [stakeStr, accountId, accounts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setDoneMsg(null);

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
      setFormError("Quota non valida (deve essere > 0).");
      return;
    }
    if (Number.isNaN(stakeNum) || stakeNum <= 0) {
      setFormError("Stake non valido (deve essere > 0).");
      return;
    }

    const stakeGuard = await assertGamingAccountCoversStake(supabase, accountId, stakeNum);
    if (!stakeGuard.ok) {
      setFormError(stakeGuard.message);
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

    const profit = previewProfit(status, stakeNum, oddsNum);

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
      bet_type: BET_TYPE_DEFAULT,
    });

    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }

    setDoneMsg("Salvata.");
    setEventName("");
    setOddsStr("");
    setStakeStr("");
    setStatus("open");
    await loadData();
  }

  if (!ready) {
    return (
      <AppShell>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-zinc-500">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          Caricamento…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="w-full space-y-6 sm:space-y-8">
        <div>
          <Link
            href="/scommesse"
            className="text-sm font-medium text-emerald-600 underline-offset-4 hover:underline dark:text-emerald-400"
          >
            ← Scommesse
          </Link>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
            Nuova scommessa
          </h1>
        </div>

        {loadError ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {loadError}
          </p>
        ) : null}

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)}>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Conto gioco
              </label>
              <select
                required
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">— Seleziona —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name}
                    {gamingAccountBookmakerDisplay(a)
                      ? ` · ${gamingAccountBookmakerDisplay(a)}`
                      : ""}{" "}
                    · saldo{" "}
                    {formatMoney(a.current_balance)} €
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Staker
              </label>
              <select
                required
                value={stakerId}
                onChange={(e) => setStakerId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">— Seleziona —</option>
                {stakers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="event_name"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Nome evento
              </label>
              <input
                id="event_name"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder="Es. Milan — Napoli 1X2"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="quota"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Quota (decimale)
                </label>
                <input
                  id="quota"
                  value={oddsStr}
                  onChange={(e) => setOddsStr(e.target.value)}
                  required
                  inputMode="decimal"
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  placeholder="2,10"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="stake"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Stake (€)
                </label>
                <input
                  id="stake"
                  value={stakeStr}
                  onChange={(e) => setStakeStr(e.target.value)}
                  required
                  inputMode="decimal"
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  placeholder="10,00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Stato
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BetStatus)}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {BET_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {status !== "open" &&
            !Number.isNaN(oddsNum) &&
            oddsNum > 0 &&
            !Number.isNaN(stakeNum) &&
            stakeNum > 0 ? (
              <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                Profit previsto (allineato al DB):{" "}
                <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {formatMoney(previewProfit(status, stakeNum, oddsNum))} €
                </span>
                {status === "won" ? " → stake × quota − stake" : null}
                {status === "lost" ? " → −stake" : null}
                {status === "void" || status === "cashout" ? " → 0" : null}
              </p>
            ) : null}

            {newBetStakeExceedsBalanceNuova && !formError ? (
              <p
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                role="status"
              >
                Saldo conto insufficiente
              </p>
            ) : null}
            {formError ? (
              <p
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
              >
                {formError}
              </p>
            ) : null}
            {doneMsg ? (
              <p
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
                role="status"
              >
                {doneMsg}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting || newBetStakeExceedsBalanceNuova}
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              {submitting ? "Salvataggio…" : "Salva scommessa"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
