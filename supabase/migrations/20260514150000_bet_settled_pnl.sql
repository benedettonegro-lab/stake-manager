-- P&L metrico (solo refertate): open = 0; allineato a `betSettledPnL` in app.
-- I saldi conto/staker restano su `bet_balance_contribution` + trigger `bets_apply_settlement_balances`.

CREATE OR REPLACE FUNCTION public.bet_settled_pnl(
  p_status public.bet_status,
  p_stake numeric,
  p_odds numeric,
  p_profit numeric
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT (
    CASE
      WHEN p_status = 'open'::public.bet_status THEN 0::numeric
      WHEN p_status = 'lost'::public.bet_status THEN round(-coalesce(p_stake, 0), 4)
      WHEN p_status = 'won'::public.bet_status THEN
        CASE
          WHEN coalesce(p_odds, 0) > 0 THEN
            round(coalesce(p_stake, 0) * coalesce(p_odds, 0) - coalesce(p_stake, 0), 4)
          ELSE round(-coalesce(p_stake, 0), 4)
        END
      WHEN p_status = 'void'::public.bet_status THEN 0::numeric
      WHEN p_status = 'cashout'::public.bet_status THEN round(coalesce(p_profit, 0), 4)
      ELSE 0::numeric
    END
  )::numeric;
$fn$;

COMMENT ON FUNCTION public.bet_settled_pnl(public.bet_status, numeric, numeric, numeric) IS
  'Profit/ROI UI: solo giocate refertate; le aperte non contribuiscono. Distinto da bet_balance_contribution (saldo).';
