/** Righe `transactions` già filtrate su `status = 'completed'` (solo lettura UI). */
export type CompletedTxAccountRow = {
  gaming_account_id: string;
  type: string;
  amount: string;
};

export type AccountTransactionAgg = {
  totalDeposits: number;
  totalWithdrawals: number;
};

function parseAmount(s: string): number {
  return Number.parseFloat(String(s).replace(",", ".")) || 0;
}

/** Somma depositi e prelievi completati per `gaming_account_id`. */
export function aggregateCompletedTransactionsByGamingAccount(
  rows: CompletedTxAccountRow[],
): Map<string, AccountTransactionAgg> {
  const m = new Map<string, AccountTransactionAgg>();
  for (const r of rows) {
    const id = r.gaming_account_id;
    if (!id) continue;
    const prev = m.get(id) ?? { totalDeposits: 0, totalWithdrawals: 0 };
    const amt = parseAmount(r.amount);
    if (r.type === "deposit") prev.totalDeposits += amt;
    else if (r.type === "withdrawal") prev.totalWithdrawals += amt;
    m.set(id, prev);
  }
  return m;
}
