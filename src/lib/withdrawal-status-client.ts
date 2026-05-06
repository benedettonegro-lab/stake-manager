import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recalculateBothSidesAfterTransactionChange,
  recalculateGamingAccountBalanceFromLedger,
  recalculatePaymentMethodBalanceFromLedger,
} from "@/lib/recalculate-movement-balances";
import {
  isTransactionStatus,
  type TransactionStatus,
} from "@/lib/transaction-status";
import { assertGamingAccountCoversWithdrawalCompletion } from "@/lib/balance-validation";
import { withdrawalBalanceDiff } from "@/lib/withdrawal-status-delta";

export type WithdrawalStatusRow = {
  id: string;
  type: string;
  status: string;
  amount: string;
  gaming_account_id: string;
  payment_method_id: string;
};

/**
 * 1) Aggiorna solo `transactions.status` su Supabase.
 * 2) Ricalcola e salva saldi conto e metodo dal ledger (mai somma incrementale sulla UI).
 * 3) In caso di errore dopo l’update stato: rollback stato + riallinea saldi.
 */
export async function applyWithdrawalStatusChange(
  supabase: SupabaseClient,
  row: WithdrawalStatusRow,
  newStatus: TransactionStatus,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (row.type !== "withdrawal") {
    return { ok: false, message: "Non è un prelievo." };
  }

  const oldStatus: TransactionStatus = isTransactionStatus(row.status)
    ? row.status
    : "pending";
  if (oldStatus === newStatus) {
    return { ok: true };
  }

  const amount = Number.parseFloat(String(row.amount).replace(",", "."));
  if (Number.isNaN(amount) || amount <= 0) {
    return { ok: false, message: "Importo transazione non valido." };
  }

  const { diffAccount: differenceAccount, diffMethod: differenceMethod } =
    withdrawalBalanceDiff(amount, oldStatus, newStatus);

  if (newStatus === "completed" && oldStatus !== "completed") {
    const guard = await assertGamingAccountCoversWithdrawalCompletion(
      supabase,
      row.gaming_account_id,
      amount,
    );
    if (!guard.ok) {
      return { ok: false, message: guard.message };
    }
  }

  const transactionId = row.id;
  const gamingAccountId = row.gaming_account_id;
  const paymentMethodId = row.payment_method_id;

  console.log("[withdrawal status] transaction.id", transactionId);
  console.log("[withdrawal status] oldStatus", oldStatus);
  console.log("[withdrawal status] newStatus", newStatus);
  console.log("[withdrawal status] amount", amount);
  console.log("[withdrawal status] differenceAccount", differenceAccount);
  console.log("[withdrawal status] differenceMethod", differenceMethod);

  const { error: txErr } = await supabase
    .from("transactions")
    .update({ status: newStatus })
    .eq("id", transactionId);

  if (txErr) {
    console.error("[withdrawal status] transactions update failed", txErr);
    return { ok: false, message: txErr.message };
  }

  const accRes = await recalculateGamingAccountBalanceFromLedger(
    supabase,
    gamingAccountId,
  );
  if (!accRes.ok) {
    console.error("[withdrawal status] gaming recalc failed", accRes.message);
    const { error: revErr } = await supabase
      .from("transactions")
      .update({ status: oldStatus })
      .eq("id", transactionId);
    if (revErr) {
      console.error("[withdrawal status] rollback transactions failed", revErr);
    }
    const repair = await recalculateBothSidesAfterTransactionChange(
      supabase,
      gamingAccountId,
      paymentMethodId,
    );
    if (!repair.ok) {
      console.error("[withdrawal status] repair balances failed", repair.message);
    }
    return { ok: false, message: accRes.message };
  }

  const pmRes = await recalculatePaymentMethodBalanceFromLedger(
    supabase,
    paymentMethodId,
  );
  if (!pmRes.ok) {
    console.error("[withdrawal status] payment method recalc failed", pmRes.message);
    const { error: revErr } = await supabase
      .from("transactions")
      .update({ status: oldStatus })
      .eq("id", transactionId);
    if (revErr) {
      console.error("[withdrawal status] rollback transactions failed", revErr);
    }
    const repair = await recalculateBothSidesAfterTransactionChange(
      supabase,
      gamingAccountId,
      paymentMethodId,
    );
    if (!repair.ok) {
      console.error("[withdrawal status] repair balances failed", repair.message);
    }
    return { ok: false, message: pmRes.message };
  }

  console.log(
    "[withdrawal status] recalculated current_balance (gaming)",
    accRes.balance,
  );
  console.log("[withdrawal status] recalculated balance (method)", pmRes.balance);

  return { ok: true };
}
