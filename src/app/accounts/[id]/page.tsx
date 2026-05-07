"use client";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SheetModal } from "@/components/sheet-modal";
import { formatAccountRoi } from "@/lib/account-bet-metrics";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import { legacyLabelParts, paymentMethodTitle } from "@/lib/payment-methods";
import {
  assertGamingAccountCoversWithdrawalCompletion,
  assertPaymentMethodCoversDeposit,
} from "@/lib/balance-validation";
import { recalculatePaymentMethodBalanceFromLedger } from "@/lib/recalculate-movement-balances";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAYMENT_TYPES = [
  "Revolut",
  "PayPal",
  "Cash",
  "Skrill",
  "Bonifico",
  "Crypto",
  "Altro",
] as const;

type PaymentType = (typeof PAYMENT_TYPES)[number];

type GamingAccount = {
  id: string;
  account_name: string;
  bookmaker: string;
  bookmaker_id: string | null;
  bookmakers: { name: string } | { name: string }[] | null;
  note: string | null;
  current_balance: string;
  player_id: string;
  identity_id: string;
};

type TransactionStatus = "pending" | "completed" | "rejected";

type PaymentMethod = {
  id: string;
  label: string | null;
  method_name: string;
  balance: string;
  created_at: string;
  type: string;
  note: string | null;
  player_id: string;
  identity_id: string;
};

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const accountId =
    typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<GamingAccount | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodsError, setMethodsError] = useState<string | null>(null);
  const [betAgg, setBetAgg] = useState({ totalProfit: 0, totalStake: 0 });

  const [formNome, setFormNome] = useState("");
  const [formTipo, setFormTipo] = useState<PaymentType>("Revolut");
  const [formBalanceStr, setFormBalanceStr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [txOpen, setTxOpen] = useState(false);
  const [txMode, setTxMode] = useState<"deposit" | "withdrawal">("deposit");
  const [txPmId, setTxPmId] = useState("");
  const [txAmountStr, setTxAmountStr] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [txWithdrawStatus, setTxWithdrawStatus] =
    useState<TransactionStatus>("completed");
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [editMethodNome, setEditMethodNome] = useState("");
  const [editMethodTipo, setEditMethodTipo] = useState<PaymentType>("Revolut");
  const [editMethodBalance, setEditMethodBalance] = useState("");
  const [editMethodNote, setEditMethodNote] = useState("");
  const [editMethodSaving, setEditMethodSaving] = useState(false);
  const [editMethodError, setEditMethodError] = useState<string | null>(null);

  const [deleteMethodTarget, setDeleteMethodTarget] = useState<PaymentMethod | null>(
    null,
  );
  const [deleteMethodLoading, setDeleteMethodLoading] = useState(false);
  const [deleteMethodError, setDeleteMethodError] = useState<string | null>(null);

  const txAmountParsed = useMemo(() => {
    const n = Number.parseFloat(txAmountStr.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }, [txAmountStr]);

  const selectedPmBalForTx = useMemo(() => {
    const pm = methods.find((m) => m.id === txPmId);
    if (!pm) return NaN;
    return Number.parseFloat(pm.balance) || 0;
  }, [methods, txPmId]);

  const accountBalNum = account ? Number.parseFloat(account.current_balance) || 0 : 0;

  const txSaveDisabledByBalance =
    txOpen &&
    !Number.isNaN(txAmountParsed) &&
    txAmountParsed > 0 &&
    ((txMode === "deposit" &&
      !Number.isNaN(selectedPmBalForTx) &&
      txAmountParsed > selectedPmBalForTx) ||
      (txMode === "withdrawal" &&
        txWithdrawStatus === "completed" &&
        txAmountParsed > accountBalNum));

  const loadAll = useCallback(async () => {
    if (!accountId) return;
    setAccountError(null);
    setMethodsError(null);

    const { data: accData, error: accErr } = await supabase
      .from("gaming_accounts")
      .select(
        `
        id,
        account_name,
        bookmaker,
        bookmaker_id,
        note,
        current_balance,
        player_id,
        identity_id,
        bookmakers ( name )
      `,
      )
      .eq("id", accountId)
      .maybeSingle();

    if (accErr) {
      setAccountError(accErr.message);
      setAccount(null);
      setMethods([]);
      setBetAgg({ totalProfit: 0, totalStake: 0 });
      return;
    }
    if (!accData) {
      setAccountError("Conto non trovato o non accessibile.");
      setAccount(null);
      setMethods([]);
      setBetAgg({ totalProfit: 0, totalStake: 0 });
      return;
    }

    const acc = accData as GamingAccount;
    setAccount(acc);
    setAccountError(null);

    const [pmRes, betRes] = await Promise.all([
      supabase
        .from("payment_methods")
        .select(
          'id, label, method_name, balance, created_at, note, player_id, identity_id, "type"',
        )
        .eq("player_id", acc.player_id)
        .order("method_name"),
      supabase.from("bets").select("profit, stake").eq("gaming_account_id", accountId),
    ]);

    if (pmRes.error) {
      setMethodsError(pmRes.error.message);
      setMethods([]);
    } else {
      setMethods((pmRes.data as PaymentMethod[]) ?? []);
    }

    if (betRes.error) {
      setBetAgg({ totalProfit: 0, totalStake: 0 });
    } else {
      let totalProfit = 0;
      let totalStake = 0;
      for (const r of betRes.data ?? []) {
        totalProfit += Number.parseFloat((r as { profit: string }).profit) || 0;
        totalStake += Number.parseFloat((r as { stake: string }).stake) || 0;
      }
      setBetAgg({ totalProfit, totalStake });
    }
  }, [accountId, supabase]);

  useEffect(() => {
    if (!accountId) return;

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
  }, [accountId, loadAll, router, supabase]);

  async function handleAddMethod(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const nome = formNome.trim();
    if (!nome) {
      setFormError("Il nome è obbligatorio.");
      return;
    }
    if (!accountId || !account) {
      setFormError("Conto non valido.");
      return;
    }
    const rawBal = formBalanceStr.trim();
    const bal =
      rawBal === "" ? 0 : Number.parseFloat(rawBal.replace(",", "."));
    if (rawBal !== "" && (Number.isNaN(bal) || bal < 0)) {
      setFormError("Saldo non valido (≥ 0).");
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
      .from("payment_methods")
      .insert({
        user_id: user.id,
        player_id: account.player_id,
        identity_id: account.player_id,
        method_name: nome,
        type: formTipo,
        balance: bal,
        initial_balance: bal,
        note: null,
      })
      .select(
        'id, label, method_name, balance, created_at, note, player_id, identity_id, "type"',
      )
      .single();

    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }

    setFormNome("");
    setFormTipo("Revolut");
    setFormBalanceStr("");
    if (inserted) {
      setMethods((prev) => [...prev, inserted as PaymentMethod]);
    }
    await loadAll();
  }

  function closeTxModal() {
    setTxOpen(false);
    setTxPmId("");
    setTxAmountStr("");
    setTxNotes("");
    setTxWithdrawStatus("completed");
    setTxError(null);
    setTxSubmitting(false);
  }

  function openTxDeposit(presetPmId?: string) {
    setTxMode("deposit");
    setTxError(null);
    const first = methods[0]?.id ?? "";
    const pick =
      presetPmId && methods.some((m) => m.id === presetPmId) ? presetPmId : first;
    setTxPmId(pick);
    setTxAmountStr("");
    setTxNotes("");
    setTxWithdrawStatus("completed");
    setTxOpen(true);
  }

  function openTxWithdraw(presetPmId?: string) {
    setTxMode("withdrawal");
    setTxError(null);
    const first = methods[0]?.id ?? "";
    const pick =
      presetPmId && methods.some((m) => m.id === presetPmId) ? presetPmId : first;
    setTxPmId(pick);
    setTxAmountStr("");
    setTxNotes("");
    setTxWithdrawStatus("completed");
    setTxOpen(true);
  }

  async function handleTxSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    setTxError(null);
    const amount = Number.parseFloat(txAmountStr.replace(",", "."));
    if (Number.isNaN(amount) || amount <= 0) {
      setTxError("Importo non valido.");
      return;
    }
    if (!txPmId) {
      setTxError("Seleziona un metodo di pagamento.");
      return;
    }
    if (txMode === "deposit") {
      const depOk = await assertPaymentMethodCoversDeposit(supabase, txPmId, amount);
      if (!depOk.ok) {
        setTxError(depOk.message);
        return;
      }
    }
    if (txMode === "withdrawal" && txWithdrawStatus === "completed" && account) {
      const wOk = await assertGamingAccountCoversWithdrawalCompletion(
        supabase,
        account.id,
        amount,
      );
      if (!wOk.ok) {
        setTxError(wOk.message);
        return;
      }
    }
    setTxSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setTxSubmitting(false);
      return;
    }
    const note = txNotes.trim() ? txNotes.trim() : null;
    const base = {
      user_id: user.id,
      player_id: account.player_id,
      gaming_account_id: account.id,
      payment_method_id: txPmId,
      amount,
      note,
    };
    const row =
      txMode === "deposit"
        ? { ...base, type: "deposit" as const, status: "completed" as const }
        : {
            ...base,
            type: "withdrawal" as const,
            status: txWithdrawStatus,
          };
    const { error } = await supabase.from("transactions").insert(row);
    setTxSubmitting(false);
    if (error) {
      setTxError(error.message);
      return;
    }

    const affectsBalances =
      row.status === "completed" &&
      (txMode === "deposit" ||
        (txMode === "withdrawal" && txWithdrawStatus === "completed"));
    if (affectsBalances) {
      setAccount((prev) => {
        if (!prev) return prev;
        const cur = Number.parseFloat(String(prev.current_balance)) || 0;
        const next =
          txMode === "deposit" ? cur + amount : Math.max(0, cur - amount);
        return { ...prev, current_balance: String(next) };
      });
      const pmRecalc = await recalculatePaymentMethodBalanceFromLedger(
        supabase,
        txPmId,
      );
      if (!pmRecalc.ok) {
        setTxError(pmRecalc.message);
        console.error("[conto] ricalcolo saldo metodo fallito", pmRecalc.message);
      }
    }

    closeTxModal();
    await loadAll();
  }

  function openEditMethod(m: PaymentMethod) {
    setEditingMethod(m);
    const parsed = legacyLabelParts(m.label);
    const tipoRaw = (m.type || parsed.tipo || "").trim();
    const isKnown =
      tipoRaw && (PAYMENT_TYPES as readonly string[]).includes(tipoRaw);
    setEditMethodTipo(isKnown ? (tipoRaw as PaymentType) : "Altro");
    setEditMethodNome(
      (m.method_name || "").trim() ||
        (parsed.nome || "").trim() ||
        (m.label ?? "").trim(),
    );
    setEditMethodBalance(String(Number.parseFloat(m.balance) || 0).replace(".", ","));
    setEditMethodNote(m.note ?? "");
    setEditMethodError(null);
  }

  async function handleSaveMethod(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMethod) return;
    const nome = editMethodNome.trim();
    if (!nome) {
      setEditMethodError("Il nome è obbligatorio.");
      return;
    }
    const bal = Number.parseFloat(editMethodBalance.replace(",", "."));
    if (Number.isNaN(bal) || bal < 0) {
      setEditMethodError("Saldo metodo non valido (≥ 0).");
      return;
    }
    setEditMethodError(null);
    setEditMethodSaving(true);
    const { error } = await supabase
      .from("payment_methods")
      .update({
        type: editMethodTipo,
        balance: bal,
        note: editMethodNote.trim() ? editMethodNote.trim() : null,
        method_name: nome,
      })
      .eq("id", editingMethod.id);
    setEditMethodSaving(false);
    if (error) {
      setEditMethodError(error.message);
      return;
    }
    setEditingMethod(null);
    await loadAll();
  }

  async function handleConfirmDeleteMethod() {
    if (!deleteMethodTarget) return;
    setDeleteMethodError(null);
    setDeleteMethodLoading(true);
    const { error } = await supabase
      .from("payment_methods")
      .delete()
      .eq("id", deleteMethodTarget.id);
    setDeleteMethodLoading(false);
    if (error) {
      setDeleteMethodError(error.message);
      return;
    }
    setDeleteMethodTarget(null);
    await loadAll();
  }

  if (!accountId) {
    return (
      <AppShell title="Conto">
        <p className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-lg sm:text-base sm:text-sm text-amber-200">
          ID conto non valido.
        </p>
      </AppShell>
    );
  }

  if (!ready) {
    return (
      <AppShell title="Conto gioco">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-lg sm:text-base sm:text-sm text-[#94a3b8]">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-white/[0.12] border-t-[#a855f7]/45"
            aria-hidden
          />
          <p>Caricamento…</p>
        </div>
      </AppShell>
    );
  }

  if (accountError || !account) {
    return (
      <AppShell title="Conto gioco">
        <Link
          href="/accounts"
          className="mb-4 inline-flex text-lg sm:text-base sm:text-sm font-medium text-[#a855f7] underline-offset-4 hover:underline"
        >
          ← Conti
        </Link>
        <p
          className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-4 py-3 text-lg sm:text-base sm:text-sm text-[#fb7185]"
          role="alert"
        >
          {accountError ?? "Conto non disponibile."}
        </p>
      </AppShell>
    );
  }

  const bal = Number.parseFloat(account.current_balance) || 0;
  const balClass =
    bal > 0 ? "text-[#34d399]" : bal < 0 ? "text-red-400" : "text-[#94a3b8]";
  const { totalProfit, totalStake } = betAgg;
  const profitClass =
    totalProfit > 0
      ? "text-[#34d399]"
      : totalProfit < 0
        ? "text-red-400"
        : "text-[#94a3b8]";
  const roiStr = formatAccountRoi(totalProfit, totalStake);
  const roiClass =
    totalStake <= 0
      ? "text-[#94a3b8]"
      : totalProfit > 0
        ? "text-[#34d399]"
        : totalProfit < 0
          ? "text-red-400"
          : "text-[#94a3b8]";

  return (
    <AppShell
      title={account.account_name}
      subtitle={
        gamingAccountBookmakerDisplay(account)
          ? `${gamingAccountBookmakerDisplay(account)} · saldo, profit, ROI`
          : "Saldo, profit, ROI"
      }
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-4">
          <Link
            href="/accounts"
            className="text-lg sm:text-base sm:text-sm font-medium text-[#a855f7] underline-offset-4 hover:underline"
          >
            ← Conti
          </Link>
          <Link
            href="/identities"
            className="text-lg sm:text-base sm:text-sm font-medium text-[#a855f7] underline-offset-4 hover:underline"
          >
            Identità
          </Link>
          <Link
            href={`/players/${account.player_id}`}
            className="text-lg sm:text-base sm:text-sm font-medium text-[#94a3b8] underline-offset-4 hover:text-white hover:underline"
          >
            Performance
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={methods.length === 0}
            title={
              methods.length === 0
                ? "Aggiungi un metodo di pagamento per questa identità"
                : undefined
            }
            onClick={() => openTxDeposit()}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm sm:text-xs font-semibold text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Deposita
          </button>
          <button
            type="button"
            disabled={methods.length === 0}
            title={
              methods.length === 0
                ? "Aggiungi un metodo di pagamento per questa identità"
                : undefined
            }
            onClick={() => openTxWithdraw()}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm sm:text-xs font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Preleva
          </button>
        </div>
      </div>

      <div className="mb-8 rounded-2xl border border-white/[0.08] bg-[#0E1525] p-5 sm:p-6">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#1f2937] bg-[#121B2F] px-3 py-3">
            <dt className="text-[15px] font-semibold uppercase tracking-wide text-[#64748b]">
              Saldo reale
            </dt>
            <dd className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${balClass}`}>
              {formatMoney(account.current_balance)} €
            </dd>
            <dd className="mt-0.5 text-[15px] text-[#64748b]">Saldo conto gioco</dd>
          </div>
          <div className="rounded-xl border border-[#1f2937] bg-[#121B2F] px-3 py-3">
            <dt className="text-[15px] font-semibold uppercase tracking-wide text-[#64748b]">
              Profitto scommesse
            </dt>
            <dd className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${profitClass}`}>
              {totalProfit >= 0 ? "+" : ""}
              {formatMoney(totalProfit)} €
            </dd>
            <dd className="mt-0.5 text-[15px] text-[#64748b]">Somma profit su questo conto</dd>
          </div>
          <div className="rounded-xl border border-[#1f2937] bg-[#121B2F] px-3 py-3">
            <dt className="text-[15px] font-semibold uppercase tracking-wide text-[#64748b]">
              ROI conto
            </dt>
            <dd className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${roiClass}`}>
              {roiStr}
            </dd>
            <dd className="mt-0.5 text-[15px] text-[#64748b]">Profit ÷ stake totale</dd>
          </div>
        </dl>
        {account.note ? (
          <p className="mt-4 text-lg sm:text-base sm:text-sm text-[#94a3b8]">{account.note}</p>
        ) : null}
      </div>

      <section className="space-y-4" aria-labelledby="pm-section-title">
        <h2
          id="pm-section-title"
          className="text-sm sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#64748b]"
        >
          Metodi di pagamento
        </h2>
        <p className="mt-1 text-[15px] leading-relaxed text-[#64748b]">
          Elenco per identità (stesso player del conto): usabili su questo conto e sugli altri conti del cliente.
        </p>

        {methodsError ? (
          <p
            className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-4 py-3 text-lg sm:text-base sm:text-sm text-[#fb7185]"
            role="alert"
          >
            {methodsError}
          </p>
        ) : null}

        {methods.length === 0 && !methodsError ? (
          <p className="rounded-2xl border border-dashed border-white/[0.08] bg-[#0E1525]/60 px-4 py-8 text-center text-lg sm:text-base sm:text-sm text-[#94a3b8]">
            Nessun metodo di pagamento. Aggiungine uno con il modulo qui sotto.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {methods.map((m) => {
              const nome = (m.method_name || "").trim() || "—";
              const displayTipo = (m.type || "").trim();
              const mb = Number.parseFloat(m.balance) || 0;
              const mbClass =
                mb > 0 ? "text-[#34d399]" : mb === 0 ? "text-[#94a3b8]" : "text-red-400";
              return (
                <li
                  key={m.id}
                  className="rounded-2xl border border-white/[0.08] bg-[#0E1525] p-3.5 sm:p-4"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-lg sm:text-base sm:text-sm font-semibold text-white">{nome}</p>
                        {displayTipo ? (
                          <p className="mt-0.5 text-[15px] text-[#94a3b8]">{displayTipo}</p>
                        ) : null}
                        <p className={`mt-1 text-lg sm:text-base font-bold tabular-nums ${mbClass}`}>
                          {formatMoney(m.balance)} €
                        </p>
                        {m.note ? (
                          <p className="mt-1 text-sm sm:text-xs text-[#94a3b8]">{m.note}</p>
                        ) : null}
                        <p className="mt-1 text-[9px] uppercase tracking-wide text-[#64748b]">
                          Aggiunto{" "}
                          {new Date(m.created_at).toLocaleString("it-IT", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditMethod(m)}
                        className="rounded-lg border border-white/[0.08] bg-[#1e293b] px-2 py-1 text-[15px] font-semibold text-[#e2e8f0]"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteMethodError(null);
                          setDeleteMethodTarget(m);
                        }}
                        className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-[15px] font-semibold text-red-300"
                      >
                        Elimina
                      </button>
                      <button
                        type="button"
                        onClick={() => openTxDeposit(m.id)}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[15px] font-semibold text-emerald-200"
                      >
                        Deposita
                      </button>
                      <button
                        type="button"
                        onClick={() => openTxWithdraw(m.id)}
                        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[15px] font-semibold text-amber-100"
                      >
                        Preleva
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#0E1525] p-5 sm:p-6">
          <h3 className="text-lg sm:text-base sm:text-sm font-semibold text-white">Nuovo metodo</h3>
          <p className="mt-1 text-sm sm:text-xs text-[#94a3b8]">
            Saldo iniziale e movimenti: anche tramite depositi/prelievi registrati come{" "}
            <span className="font-mono text-[#cbd5e1]">transactions</span>.
          </p>

          <form className="mt-5 space-y-4" onSubmit={(e) => void handleAddMethod(e)}>
            <div className="space-y-1.5">
              <label
                htmlFor="pm-nome"
                className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
              >
                Nome
              </label>
              <input
                id="pm-nome"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                required
                className="sm-input"
                placeholder="Es. Conto principale Skrill"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="pm-tipo"
                className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
              >
                Tipo
              </label>
              <select
                id="pm-tipo"
                value={formTipo}
                onChange={(e) => setFormTipo(e.target.value as PaymentType)}
                className="sm-input"
              >
                {PAYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="pm-saldo-iniz"
                className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
              >
                Saldo iniziale (€)
              </label>
              <input
                id="pm-saldo-iniz"
                value={formBalanceStr}
                onChange={(e) => setFormBalanceStr(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="sm-input"
              />
            </div>

            {formError ? (
              <p
                className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-lg sm:text-base sm:text-sm text-[#fb7185]"
                role="alert"
              >
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="sm-btn-primary w-full sm:w-auto sm:px-8"
            >
              {submitting ? "Salvataggio…" : "Aggiungi metodo"}
            </button>
          </form>
        </div>
      </section>

      <SheetModal
        open={txOpen}
        title={txMode === "deposit" ? "Deposito sul conto" : "Prelievo dal conto"}
        dismissDisabled={txSubmitting}
        onClose={() => {
          if (!txSubmitting) closeTxModal();
        }}
      >
        <form className="space-y-3" onSubmit={(e) => void handleTxSubmit(e)}>
          <p className="text-sm sm:text-xs text-[#94a3b8]">
            Conto:{" "}
            <span className="font-medium text-white">{account.account_name}</span>
          </p>
          <div className="space-y-1">
            <label className="text-[15px] font-semibold uppercase tracking-wide text-[#64748b]">
              Metodo
            </label>
            <select
              required
              value={txPmId}
              onChange={(e) => setTxPmId(e.target.value)}
              className="sm-input min-h-11 w-full text-lg sm:min-h-10 sm:text-sm"
            >
              <option value="">—</option>
              {methods.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {paymentMethodTitle(pm)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[15px] font-semibold uppercase tracking-wide text-[#64748b]">
              Importo (€)
            </label>
            <input
              value={txAmountStr}
              onChange={(e) => setTxAmountStr(e.target.value)}
              inputMode="decimal"
              required
              placeholder="0,00"
              className="sm-input min-h-11 w-full text-lg sm:min-h-10 sm:text-sm"
            />
          </div>
          {txMode === "withdrawal" ? (
            <div className="space-y-1">
              <label className="text-[15px] font-semibold uppercase tracking-wide text-[#64748b]">
                Stato
              </label>
              <select
                value={txWithdrawStatus}
                onChange={(e) =>
                  setTxWithdrawStatus(e.target.value as TransactionStatus)
                }
                className="sm-input min-h-11 w-full text-lg sm:min-h-10 sm:text-sm"
              >
                <option value="completed">Completato</option>
                <option value="pending">In attesa</option>
                <option value="rejected">Rifiutato</option>
              </select>
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="text-[15px] font-semibold uppercase tracking-wide text-[#64748b]">
              Note (opzionale)
            </label>
            <input
              value={txNotes}
              onChange={(e) => setTxNotes(e.target.value)}
              placeholder="Riferimento…"
              className="sm-input min-h-11 w-full text-lg sm:min-h-10 sm:text-sm"
            />
          </div>
          {txSaveDisabledByBalance && !txError ? (
            <p
              className="rounded-lg border border-[#fb7185]/35 bg-[#fb7185]/10 px-2.5 py-1.5 text-sm sm:text-xs text-[#fb7185]"
              role="status"
            >
              {txMode === "deposit"
                ? "Saldo metodo insufficiente"
                : "Saldo conto insufficiente per completare il prelievo"}
            </p>
          ) : null}
          {txError ? (
            <p
              className="rounded-lg border border-[#fb7185]/35 bg-[#fb7185]/10 px-2.5 py-1.5 text-sm sm:text-xs text-[#fb7185]"
              role="alert"
            >
              {txError}
            </p>
          ) : null}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={txSubmitting}
              onClick={() => {
                if (!txSubmitting) closeTxModal();
              }}
              className="h-10 flex-1 rounded-xl border border-white/[0.08] text-lg sm:text-base sm:text-sm text-[#e2e8f0]"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={txSubmitting || txSaveDisabledByBalance}
              className="sm-btn-primary h-10 flex-1 text-lg sm:text-base sm:text-sm disabled:cursor-not-allowed disabled:opacity-45"
            >
              {txSubmitting ? "…" : "Registra"}
            </button>
          </div>
        </form>
      </SheetModal>

      <SheetModal
        open={editingMethod !== null}
        title="Modifica metodo di pagamento"
        dismissDisabled={editMethodSaving}
        onClose={() => {
          if (!editMethodSaving) setEditingMethod(null);
        }}
      >
        <form className="space-y-4" onSubmit={(e) => void handleSaveMethod(e)}>
          <div className="space-y-1.5">
            <label
              htmlFor="pm-edit-nome"
              className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
            >
              Nome metodo
            </label>
            <input
              id="pm-edit-nome"
              value={editMethodNome}
              onChange={(e) => setEditMethodNome(e.target.value)}
              required
              className="sm-input"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="pm-edit-tipo"
              className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
            >
              Tipo
            </label>
            <select
              id="pm-edit-tipo"
              value={editMethodTipo}
              onChange={(e) => setEditMethodTipo(e.target.value as PaymentType)}
              className="sm-input"
            >
              {PAYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="pm-edit-saldo"
              className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
            >
              Saldo corrente (€)
            </label>
            <input
              id="pm-edit-saldo"
              value={editMethodBalance}
              onChange={(e) => setEditMethodBalance(e.target.value)}
              required
              inputMode="decimal"
              className="sm-input"
            />
            <p className="text-[15px] text-[#64748b]">
              Aggiorna solo se allinei manualmente; i movimenti su transazioni modificano anche questo saldo.
            </p>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="pm-edit-note"
              className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
            >
              Note
            </label>
            <textarea
              id="pm-edit-note"
              value={editMethodNote}
              onChange={(e) => setEditMethodNote(e.target.value)}
              rows={2}
              className="sm-input"
              placeholder="Opzionale"
            />
          </div>
          {editMethodError ? (
            <p
              className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-lg sm:text-base sm:text-sm text-[#fb7185]"
              role="alert"
            >
              {editMethodError}
            </p>
          ) : null}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={editMethodSaving}
              onClick={() => setEditingMethod(null)}
              className="h-11 flex-1 rounded-xl border border-white/[0.08] bg-[#0E1525] text-lg sm:text-base sm:text-sm font-semibold text-[#e2e8f0] disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={editMethodSaving}
              className="sm-btn-primary flex-1 disabled:opacity-60"
            >
              {editMethodSaving ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </form>
      </SheetModal>

      <ConfirmDialog
        open={deleteMethodTarget !== null}
        title="Eliminare questo metodo?"
        message={
          deleteMethodTarget
            ? `Rimuovi «${paymentMethodTitle(deleteMethodTarget)}». Non è possibile se esistono transazioni collegate.`
            : ""
        }
        confirmText="Elimina"
        variant="danger"
        loading={deleteMethodLoading}
        error={deleteMethodError}
        onCancel={() => {
          if (!deleteMethodLoading) {
            setDeleteMethodError(null);
            setDeleteMethodTarget(null);
          }
        }}
        onConfirm={async () => {
          await handleConfirmDeleteMethod();
        }}
      />
    </AppShell>
  );
}
