import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE = 1000;

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function parseAmount(value: unknown): number {
  const n = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Somma importi transazioni `completed` per conto gioco (paginazione client). */
async function sumCompletedTransactionsForGamingAccount(
  supabase: SupabaseClient,
  gamingAccountId: string,
): Promise<{ deposits: number; withdrawals: number; error: string | null }> {
  let from = 0;
  let deposits = 0;
  let withdrawals = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("transactions")
      .select("type, amount")
      .eq("gaming_account_id", gamingAccountId)
      .eq("status", "completed")
      .range(from, from + PAGE - 1);

    if (error) {
      return { deposits: 0, withdrawals: 0, error: error.message };
    }
    const rows = data ?? [];
    for (const row of rows) {
      const amt = parseAmount(row.amount);
      if (row.type === "deposit") deposits += amt;
      else if (row.type === "withdrawal") withdrawals += amt;
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return { deposits, withdrawals, error: null };
}

/** Somma depositi / prelievi `completed` legati al metodo (`payment_method_id`). */
async function sumCompletedTransactionsForPaymentMethod(
  supabase: SupabaseClient,
  methodId: string,
): Promise<{ deposits: number; withdrawals: number; error: string | null }> {
  let from = 0;
  let deposits = 0;
  let withdrawals = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("transactions")
      .select("type, amount")
      .eq("payment_method_id", methodId)
      .eq("status", "completed")
      .range(from, from + PAGE - 1);

    if (error) {
      return { deposits: 0, withdrawals: 0, error: error.message };
    }
    const rows = data ?? [];
    for (const row of rows) {
      const amt = parseAmount(row.amount);
      if (row.type === "deposit") deposits += amt;
      else if (row.type === "withdrawal") withdrawals += amt;
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return { deposits, withdrawals, error: null };
}

/**
 * Effetto referti su conto (stesso criterio del trigger: `profit` conta solo per `won` / `lost`).
 * I depositi/prelievi non sono qui: servono perché `current_balance` nel DB include anche le scommesse.
 */
async function sumSettledBetProfitForGamingAccount(
  supabase: SupabaseClient,
  gamingAccountId: string,
): Promise<{ sum: number; error: string | null }> {
  let from = 0;
  let total = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("bets")
      .select("status, profit")
      .eq("gaming_account_id", gamingAccountId)
      .range(from, from + PAGE - 1);

    if (error) {
      return { sum: 0, error: error.message };
    }
    const rows = data ?? [];
    for (const row of rows) {
      if (row.status === "won" || row.status === "lost") {
        total += parseAmount(row.profit);
      }
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return { sum: round4(total), error: null };
}

/**
 * Saldo conto: `initial_balance` + depositi completed − prelievi completed + referti scommesse.
 * Non usa `current_balance` come base (evita doppi conteggi su cambio stato transazione).
 */
export async function recalculateGamingAccountBalanceFromLedger(
  supabase: SupabaseClient,
  gamingAccountId: string,
): Promise<{ ok: true; balance: number } | { ok: false; message: string }> {
  const { data: acc, error: accErr } = await supabase
    .from("gaming_accounts")
    .select("initial_balance")
    .eq("id", gamingAccountId)
    .maybeSingle();

  if (accErr) {
    return { ok: false, message: accErr.message };
  }
  if (!acc) {
    return { ok: false, message: "Conto gioco non trovato." };
  }

  const initial = parseAmount((acc as { initial_balance: unknown }).initial_balance);

  const sums = await sumCompletedTransactionsForGamingAccount(supabase, gamingAccountId);
  if (sums.error) {
    return { ok: false, message: sums.error };
  }

  const betRes = await sumSettledBetProfitForGamingAccount(supabase, gamingAccountId);
  if (betRes.error) {
    return { ok: false, message: betRes.error };
  }

  const balance = round4(
    initial + sums.deposits - sums.withdrawals + betRes.sum,
  );

  if (balance < 0) {
    return {
      ok: false,
      message: "Saldo conto calcolato negativo (verifica movimenti e scommesse).",
    };
  }

  const { error: upErr } = await supabase
    .from("gaming_accounts")
    .update({ current_balance: balance })
    .eq("id", gamingAccountId);

  if (upErr) {
    return { ok: false, message: upErr.message };
  }

  return { ok: true, balance };
}

/**
 * Saldo metodo da ledger (non sommare sul `balance` corrente):
 * `balance = initial_balance - depositi_completed + prelievi_completed`.
 * Legge `payment_methods.initial_balance`, somma su `transactions` con
 * `.eq("payment_method_id", methodId)` e aggiorna solo `payment_methods.balance`.
 */
export async function recalculatePaymentMethodBalanceFromLedger(
  supabase: SupabaseClient,
  methodId: string,
): Promise<{ ok: true; balance: number } | { ok: false; message: string }> {
  const { data: pm, error: pmErr } = await supabase
    .from("payment_methods")
    .select("initial_balance")
    .eq("id", methodId)
    .maybeSingle();

  if (pmErr) {
    return { ok: false, message: pmErr.message };
  }
  if (!pm) {
    return { ok: false, message: "Metodo di pagamento non trovato." };
  }

  const initial = parseAmount((pm as { initial_balance: unknown }).initial_balance);

  const sums = await sumCompletedTransactionsForPaymentMethod(supabase, methodId);
  if (sums.error) {
    return { ok: false, message: sums.error };
  }

  const balance = round4(initial - sums.deposits + sums.withdrawals);

  if (balance < 0) {
    return {
      ok: false,
      message: "Saldo metodo calcolato negativo (verifica movimenti).",
    };
  }

  const { error: upErr } = await supabase
    .from("payment_methods")
    .update({ balance })
    .eq("id", methodId);

  if (upErr) {
    return { ok: false, message: upErr.message };
  }

  return { ok: true, balance };
}

/** Dopo rollback dello stato transazione, riallinea entrambi i saldi al ledger corrente. */
export async function recalculateBothSidesAfterTransactionChange(
  supabase: SupabaseClient,
  gamingAccountId: string,
  paymentMethodId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const acc = await recalculateGamingAccountBalanceFromLedger(supabase, gamingAccountId);
  if (!acc.ok) return acc;
  const pm = await recalculatePaymentMethodBalanceFromLedger(supabase, paymentMethodId);
  if (!pm.ok) return pm;
  return { ok: true };
}
