"use client";

import { AppShell } from "@/components/app-shell";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import { paymentMethodTitle } from "@/lib/payment-methods";
import {
  isTransactionStatus,
  transactionStatusBadgeClass,
  transactionStatusLabel,
  type TransactionStatus,
} from "@/lib/transaction-status";
import { WITHDRAWAL_STATUS_SELECT_OPTIONS } from "@/lib/withdrawal-status-delta";
import {
  assertGamingAccountCoversWithdrawalCompletion,
  assertPaymentMethodCoversDeposit,
} from "@/lib/balance-validation";
import { recalculatePaymentMethodBalanceFromLedger } from "@/lib/recalculate-movement-balances";
import { applyWithdrawalStatusChange } from "@/lib/withdrawal-status-client";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

/** Tipo movimento su `transactions.type` (deposit / withdrawal). */
type TxnType = "deposit" | "withdrawal";

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

type PaymentMethodRow = {
  id: string;
  label: string | null;
  method_name: string;
  player_id: string;
  identity_id: string;
  balance: string;
  type: string;
  note: string | null;
};

type TransactionRow = {
  id: string;
  type: TxnType;
  amount: string;
  status: string;
  created_at: string;
  note: string | null;
  gaming_account_id: string;
  payment_method_id: string;
  gaming_accounts: {
    account_name: string;
    bookmaker: string;
    bookmaker_id?: string | null;
    bookmakers?: { name: string } | null;
  } | null;
  payment_methods: { label: string | null; method_name: string; type: string | null } | null;
};

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function txnTypeLabel(t: TxnType): string {
  return t === "deposit" ? "Deposito" : "Prelievo";
}

function TransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accountId, setAccountId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [txnType, setTxnType] = useState<TxnType>("deposit");
  const [amountStr, setAmountStr] = useState("");
  const [formNote, setFormNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [txActionLoadingId, setTxActionLoadingId] = useState<string | null>(null);
  const [listActionError, setListActionError] = useState<string | null>(null);

  const methodsForAccount = useMemo(() => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return [];
    return paymentMethods.filter(
      (pm) => pm.player_id === acc.player_id && pm.identity_id === acc.identity_id,
    );
  }, [accountId, accounts, paymentMethods]);

  const loadData = useCallback(async () => {
    setLoadError(null);
    const [aRes, pmRes, tRes] = await Promise.all([
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
      supabase
        .from("payment_methods")
        .select(
          'id, label, method_name, player_id, identity_id, balance, note, "type"',
        )
        .order("method_name"),
      supabase
        .from("transactions")
        .select(
          `
          id,
          "type",
          amount,
          status,
          created_at,
          note,
          gaming_account_id,
          payment_method_id,
          gaming_accounts ( account_name, bookmaker, bookmaker_id, bookmakers ( name ) ),
          payment_methods ( label, method_name, "type" )
        `,
        )
        .order("created_at", { ascending: false })
        .limit(75),
    ]);

    if (aRes.error || pmRes.error || tRes.error) {
      setLoadError(
        aRes.error?.message ??
          pmRes.error?.message ??
          tRes.error?.message ??
          "Errore caricamento",
      );
      return;
    }
    setAccounts((aRes.data as AccountRow[]) ?? []);
    setPaymentMethods((pmRes.data as PaymentMethodRow[]) ?? []);
    setTransactions((tRes.data as unknown as TransactionRow[]) ?? []);
    setListActionError(null);
  }, [supabase]);

  async function updateWithdrawalStatus(t: TransactionRow, newStatus: TransactionStatus) {
    setListActionError(null);
    setTxActionLoadingId(t.id);
    const result = await applyWithdrawalStatusChange(supabase, t, newStatus);
    setTxActionLoadingId(null);
    if (!result.ok) {
      setListActionError(result.message);
      console.error("[withdrawal status]", result.message);
      return;
    }
    await loadData();
  }

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
      await loadData();
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [loadData, router, supabase]);

  useEffect(() => {
    if (!ready || accounts.length === 0) return;
    const accParam = searchParams.get("account");
    const typeParam = searchParams.get("type");
    if (accParam && accounts.some((a) => a.id === accParam)) {
      setAccountId(accParam);
    }
    if (typeParam === "deposit" || typeParam === "withdrawal") {
      setTxnType(typeParam);
    }
  }, [ready, accounts, searchParams]);

  useEffect(() => {
    if (!accountId) {
      setPaymentMethodId("");
      return;
    }
    setPaymentMethodId((prev) => {
      const ok = methodsForAccount.some((pm) => pm.id === prev);
      if (ok) return prev;
      return methodsForAccount[0]?.id ?? "";
    });
  }, [accountId, methodsForAccount]);

  const formAmountParsed = useMemo(() => {
    const n = Number.parseFloat(amountStr.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }, [amountStr]);

  const selectedMethodForForm = useMemo(
    () => paymentMethods.find((pm) => pm.id === paymentMethodId),
    [paymentMethods, paymentMethodId],
  );
  const selectedPmBalanceNum = selectedMethodForForm
    ? Number.parseFloat(selectedMethodForForm.balance) || 0
    : NaN;

  const selectedAccountBalNum = useMemo(() => {
    const a = accounts.find((x) => x.id === accountId);
    if (!a) return NaN;
    return Number.parseFloat(a.current_balance) || 0;
  }, [accounts, accountId]);

  const formSaveDisabledByBalance =
    !Number.isNaN(formAmountParsed) &&
    formAmountParsed > 0 &&
    Boolean(paymentMethodId) &&
    Boolean(accountId) &&
    ((txnType === "deposit" &&
      !Number.isNaN(selectedPmBalanceNum) &&
      formAmountParsed > selectedPmBalanceNum) ||
      (txnType === "withdrawal" &&
        !Number.isNaN(selectedAccountBalNum) &&
        formAmountParsed > selectedAccountBalNum));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!accountId || !paymentMethodId) {
      setFormError("Seleziona conto gioco e metodo di pagamento.");
      return;
    }

    const amount = Number.parseFloat(amountStr.replace(",", "."));
    if (Number.isNaN(amount) || amount <= 0) {
      setFormError("Importo non valido (deve essere maggiore di zero).");
      return;
    }

    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) {
      setFormError("Conto non trovato.");
      return;
    }

    if (txnType === "deposit") {
      const depOk = await assertPaymentMethodCoversDeposit(supabase, paymentMethodId, amount);
      if (!depOk.ok) {
        setFormError(depOk.message);
        return;
      }
    } else {
      const wOk = await assertGamingAccountCoversWithdrawalCompletion(
        supabase,
        accountId,
        amount,
      );
      if (!wOk.ok) {
        setFormError(wOk.message);
        return;
      }
    }

    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      return;
    }

    const note = formNote.trim() ? formNote.trim() : null;
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      player_id: acc.player_id,
      gaming_account_id: accountId,
      payment_method_id: paymentMethodId,
      type: txnType,
      amount,
      status: "completed",
      note,
    });

    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }

    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== accountId) return a;
        const cur = Number.parseFloat(String(a.current_balance)) || 0;
        const next =
          txnType === "deposit" ? cur + amount : Math.max(0, cur - amount);
        return { ...a, current_balance: String(next) };
      }),
    );

    const pmRecalc = await recalculatePaymentMethodBalanceFromLedger(
      supabase,
      paymentMethodId,
    );
    if (!pmRecalc.ok) {
      setFormError(pmRecalc.message);
      console.error("[movimenti] ricalcolo saldo metodo fallito", pmRecalc.message);
    }

    setAmountStr("");
    setFormNote("");
    await loadData();
  }

  if (!ready) {
    return (
      <AppShell title="Movimenti">
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

  return (
    <AppShell title="Movimenti" subtitle="Depositi e prelievi tra conto gioco e metodo.">
      {loadError ? (
        <p
          className="mb-4 rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-4 py-3 text-lg sm:text-base sm:text-sm text-[#fb7185]"
          role="alert"
        >
          {loadError}
        </p>
      ) : null}

      <form
        onSubmit={(e) => void handleSave(e)}
        className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#0E1525] p-5 shadow-md shadow-black/12"
      >
        <div className="space-y-1.5">
          <label className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
            Conto gioco
          </label>
          <select
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="sm-input"
          >
            <option value="">— Seleziona conto —</option>
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

        <div className="space-y-1.5">
          <label className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
            Metodo di pagamento
          </label>
          <select
            required
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            disabled={!accountId || methodsForAccount.length === 0}
            className="sm-input disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">
              {!accountId
                ? "— Prima scegli un conto —"
                : methodsForAccount.length === 0
                  ? "— Nessun metodo per questa identità —"
                  : "— Seleziona metodo —"}
            </option>
            {methodsForAccount.map((pm) => (
              <option key={pm.id} value={pm.id}>
                {paymentMethodTitle(pm)}
              </option>
            ))}
          </select>
          {accountId && methodsForAccount.length === 0 ? (
            <p className="text-sm sm:text-xs text-[#94a3b8]">
              Aggiungi un metodo dalla pagina Identità (stesso cliente del conto).
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
            Tipo movimento
          </label>
          <select
            value={txnType}
            onChange={(e) => setTxnType(e.target.value as TxnType)}
            className="sm-input"
          >
            <option value="deposit">Deposito</option>
            <option value="withdrawal">Prelievo</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="tx-amount"
            className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
          >
            Importo (€)
          </label>
          <input
            id="tx-amount"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            required
            inputMode="decimal"
            className="sm-input"
            placeholder="0,00"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="tx-note"
            className="text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
          >
            Note (opzionale)
          </label>
          <input
            id="tx-note"
            value={formNote}
            onChange={(e) => setFormNote(e.target.value)}
            placeholder="Riferimento interno…"
            className="sm-input"
          />
        </div>

        {formSaveDisabledByBalance && !formError ? (
          <p
            className="rounded-lg border border-[#fb7185]/35 bg-[#fb7185]/10 px-2.5 py-1.5 text-sm sm:text-xs text-[#fb7185]"
            role="status"
          >
            {txnType === "deposit"
              ? "Saldo metodo insufficiente"
              : "Saldo conto insufficiente per completare il prelievo"}
          </p>
        ) : null}
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
          disabled={
            submitting ||
            !accountId ||
            !paymentMethodId ||
            methodsForAccount.length === 0 ||
            formSaveDisabledByBalance
          }
          className="sm-btn-primary w-full sm:w-auto sm:px-8 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? "Salvataggio…" : "Salva movimento"}
        </button>
      </form>

      <section className="mt-10" aria-labelledby="tx-list-heading">
        <h2
          id="tx-list-heading"
          className="mb-3 text-sm sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#64748b]"
        >
          Ultimi movimenti
        </h2>
        {listActionError ? (
          <p
            className="mb-3 rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-lg sm:text-base sm:text-sm text-[#fb7185]"
            role="alert"
          >
            {listActionError}
          </p>
        ) : null}
        {transactions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/[0.08] bg-[#0E1525]/60 px-4 py-10 text-center text-lg sm:text-base sm:text-sm text-[#94a3b8]">
            Nessun movimento ancora.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {transactions.map((t) => {
              const amt = Number.parseFloat(t.amount) || 0;
              const isWithdrawal = t.type === "withdrawal";
              const amountClass = isWithdrawal ? "text-red-400" : "text-[#34d399]";
              const prefix = isWithdrawal ? "−" : "+";
              const acc =
                t.gaming_accounts?.account_name ??
                "Conto";
              const bk = t.gaming_accounts
                ? gamingAccountBookmakerDisplay(t.gaming_accounts)
                : "";
              const accLabel = bk ? `${acc} · ${bk}` : acc;
              const st: TransactionStatus = isTransactionStatus(t.status)
                ? t.status
                : "pending";
              const busy = txActionLoadingId === t.id;
              return (
                <li
                  key={t.id}
                  className="rounded-2xl border border-white/[0.08] bg-[#0E1525] px-4 py-4 shadow-md shadow-black/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[15px] font-semibold uppercase tracking-wide ${
                          isWithdrawal
                            ? "border-red-500/40 bg-red-500/10 text-red-400"
                            : "border-[#34d399]/40 bg-[#34d399]/10 text-[#34d399]"
                        }`}
                      >
                        {txnTypeLabel(t.type)}
                      </span>
                      <p className="mt-2 text-lg sm:text-base sm:text-sm font-medium text-white">{accLabel}</p>
                      {t.payment_methods ? (
                        <p className="mt-0.5 text-sm sm:text-xs text-[#94a3b8]">
                          {paymentMethodTitle(t.payment_methods)}
                        </p>
                      ) : null}
                      {t.note ? (
                        <p className="mt-1 line-clamp-2 text-[15px] text-[#64748b]">{t.note}</p>
                      ) : null}
                      {isWithdrawal ? (
                        <div
                          className={`mt-2 inline-flex max-w-full items-center rounded-full border pl-2 pr-1 py-0.5 ${transactionStatusBadgeClass(st)}`}
                        >
                          <label className="sr-only" htmlFor={`tx-st-${t.id}`}>
                            Stato prelievo
                          </label>
                          <select
                            id={`tx-st-${t.id}`}
                            disabled={busy}
                            value={st}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!isTransactionStatus(v)) return;
                              void updateWithdrawalStatus(t, v);
                            }}
                            className="max-w-[11rem] cursor-pointer appearance-none border-0 bg-transparent py-0.5 pl-1 pr-5 text-[15px] font-semibold uppercase tracking-wide text-inherit outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                            style={{ backgroundImage: "none" }}
                          >
                            {WITHDRAWAL_STATUS_SELECT_OPTIONS.map((opt) => (
                              <option
                                key={opt.value}
                                value={opt.value}
                                className="bg-[#0E1525] text-[#e2e8f0]"
                              >
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[15px] font-semibold uppercase tracking-wide ${transactionStatusBadgeClass(st)}`}
                          >
                            {transactionStatusLabel(st)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-lg font-bold tabular-nums ${amountClass}`}>
                        {prefix}
                        {formatMoney(amt)} €
                      </p>
                      <time
                        dateTime={t.created_at}
                        className="mt-1 block text-[15px] font-medium uppercase tracking-wide text-[#64748b]"
                      >
                        {new Date(t.created_at).toLocaleString("it-IT", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </time>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

export default function TransactionsPageRoute() {
  return (
    <Suspense
      fallback={
        <AppShell title="Movimenti" subtitle="Depositi e prelievi tra conto gioco e metodo.">
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-lg sm:text-base sm:text-sm text-[#94a3b8]">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-white/[0.12] border-t-[#a855f7]/45"
              aria-hidden
            />
            <p>Caricamento…</p>
          </div>
        </AppShell>
      }
    >
      <TransactionsPage />
    </Suspense>
  );
}
