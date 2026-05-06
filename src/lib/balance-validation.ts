import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recalculateGamingAccountBalanceFromLedger,
  recalculatePaymentMethodBalanceFromLedger,
} from "@/lib/recalculate-movement-balances";

export const ERR_DEPOSIT_PM_INSUFFICIENT = "Saldo metodo insufficiente";
export const ERR_BET_ACCOUNT_INSUFFICIENT = "Saldo conto insufficiente";
export const ERR_WITHDRAWAL_COMPLETE_INSUFFICIENT =
  "Saldo conto insufficiente per completare il prelievo";

/** Ricalcola il saldo metodo dal ledger e verifica che copra il deposito. */
export async function assertPaymentMethodCoversDeposit(
  supabase: SupabaseClient,
  paymentMethodId: string,
  amount: number,
): Promise<{ ok: true; balance: number } | { ok: false; message: string }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Importo non valido." };
  }
  const res = await recalculatePaymentMethodBalanceFromLedger(supabase, paymentMethodId);
  if (!res.ok) return res;
  if (res.balance + 1e-9 < amount) {
    return { ok: false, message: ERR_DEPOSIT_PM_INSUFFICIENT };
  }
  return { ok: true, balance: res.balance };
}

/** Ricalcola il saldo conto dal ledger e verifica che copra lo stake. */
export async function assertGamingAccountCoversStake(
  supabase: SupabaseClient,
  gamingAccountId: string,
  stake: number,
): Promise<{ ok: true; balance: number } | { ok: false; message: string }> {
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false, message: "Stake non valido." };
  }
  const res = await recalculateGamingAccountBalanceFromLedger(supabase, gamingAccountId);
  if (!res.ok) return res;
  if (res.balance + 1e-9 < stake) {
    return { ok: false, message: ERR_BET_ACCOUNT_INSUFFICIENT };
  }
  return { ok: true, balance: res.balance };
}

/** Prima di completare un prelievo: saldo conto (ledger, senza quel prelievo completed) ≥ importo. */
export async function assertGamingAccountCoversWithdrawalCompletion(
  supabase: SupabaseClient,
  gamingAccountId: string,
  amount: number,
): Promise<{ ok: true; balance: number } | { ok: false; message: string }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Importo non valido." };
  }
  const res = await recalculateGamingAccountBalanceFromLedger(supabase, gamingAccountId);
  if (!res.ok) return res;
  if (res.balance + 1e-9 < amount) {
    return { ok: false, message: ERR_WITHDRAWAL_COMPLETE_INSUFFICIENT };
  }
  return { ok: true, balance: res.balance };
}
