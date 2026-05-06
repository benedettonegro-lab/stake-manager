import type { TransactionStatus } from "@/lib/transaction-status";

/** Opzioni menu stato prelievo (allineate a `transaction_status`). */
export const WITHDRAWAL_STATUS_SELECT_OPTIONS: {
  value: TransactionStatus;
  label: string;
}[] = [
  { value: "pending", label: "In attesa" },
  { value: "completed", label: "Completato" },
  { value: "rejected", label: "Rifiutato" },
  { value: "cancelled", label: "Annullato" },
];

/**
 * Delta saldi per cambio stato prelievo: solo `completed` impatta i saldi.
 * Conto: completed ⇒ −amount; metodo: completed ⇒ +amount.
 */
export function withdrawalBalanceDiff(
  amount: number,
  oldStatus: TransactionStatus,
  newStatus: TransactionStatus,
): { diffAccount: number; diffMethod: number } {
  const oldImpact = oldStatus === "completed" ? -amount : 0;
  const newImpact = newStatus === "completed" ? -amount : 0;
  const diffAccount = newImpact - oldImpact;
  const oldMethodImpact = oldStatus === "completed" ? amount : 0;
  const newMethodImpact = newStatus === "completed" ? amount : 0;
  const diffMethod = newMethodImpact - oldMethodImpact;
  return { diffAccount, diffMethod };
}
