import type { SupabaseClient } from "@supabase/supabase-js";

/** Aggiorna saldo conto gioco e staker dopo referto (non tocca identità / players). */
export async function applySettlementBalanceDelta(
  supabase: SupabaseClient,
  gamingAccountId: string,
  stakerId: string,
  difference: number,
): Promise<void> {
  const d = Number(difference);
  if (!Number.isFinite(d) || d === 0) return;

  const { data: accRow, error: accReadErr } = await supabase
    .from("gaming_accounts")
    .select("current_balance")
    .eq("id", gamingAccountId)
    .maybeSingle();
  if (accReadErr) throw accReadErr;
  if (!accRow) throw new Error("Conto non trovato.");

  const curAcc =
    Number.parseFloat(String((accRow as { current_balance: string }).current_balance)) ||
    0;
  const nextAcc = Math.round((curAcc + d) * 1e4) / 1e4;
  if (nextAcc < -1e-9) {
    throw new Error("Saldo conto insufficiente");
  }

  const { error: accUpErr } = await supabase
    .from("gaming_accounts")
    .update({ current_balance: nextAcc })
    .eq("id", gamingAccountId);
  if (accUpErr) throw accUpErr;

  const { data: skRow, error: skReadErr } = await supabase
    .from("stakers")
    .select("balance")
    .eq("id", stakerId)
    .maybeSingle();
  if (skReadErr) throw skReadErr;
  if (!skRow) throw new Error("Staker non trovato.");

  const curSk =
    Number.parseFloat(String((skRow as { balance: string }).balance)) || 0;
  const nextSk = Math.round((curSk + d) * 1e4) / 1e4;
  if (nextSk < -1e-9) {
    throw new Error("Saldo staker insufficiente");
  }

  const { error: skUpErr } = await supabase
    .from("stakers")
    .update({ balance: nextSk })
    .eq("id", stakerId);
  if (skUpErr) throw skUpErr;
}
