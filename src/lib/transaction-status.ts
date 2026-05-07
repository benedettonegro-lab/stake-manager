/** Valori `transactions.status` (DB enum `transaction_status`). */
export type TransactionStatus =
  | "pending"
  | "completed"
  | "rejected"
  | "cancelled";

export function isTransactionStatus(s: string): s is TransactionStatus {
  return s === "pending" || s === "completed" || s === "rejected" || s === "cancelled";
}

export function transactionStatusLabel(s: TransactionStatus): string {
  if (s === "pending") return "In attesa";
  if (s === "completed") return "Completato";
  if (s === "rejected") return "Rifiutato";
  return "Annullato";
}

/** Classi Tailwind per badge stato (prelievo / deposito). */
export function transactionStatusBadgeClass(s: TransactionStatus): string {
  if (s === "pending") return "border-amber-500/45 bg-amber-500/12 text-amber-200";
  if (s === "completed") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (s === "rejected") return "border-rose-500/45 bg-rose-500/12 text-rose-200";
  return "border-[#6B7385] bg-[#131C31] text-[#8B93A7]";
}
