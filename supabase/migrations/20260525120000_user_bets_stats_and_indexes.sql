-- Statistiche giocate aggregate per utente (evita select * su tutte le righe dal client).
-- Indici compositi per liste e filtri su grandi volumi.

CREATE OR REPLACE FUNCTION public.user_bets_settled_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_bets',
    (SELECT count(*)::bigint FROM public.bets b WHERE b.user_id = auth.uid()),
    'settled_stake',
    coalesce(
      (
        SELECT sum(b.stake)::numeric
        FROM public.bets b
        WHERE b.user_id = auth.uid()
          AND b.status IS DISTINCT FROM 'open'::public.bet_status
      ),
      0
    ),
    'settled_pnl',
    coalesce(
      (
        SELECT sum(
          CASE b.status
            WHEN 'open'::public.bet_status THEN 0::numeric
            WHEN 'lost'::public.bet_status THEN round(-b.stake, 4)
            WHEN 'won'::public.bet_status THEN
              CASE
                WHEN coalesce(b.odds, 0) > 0 THEN round(b.stake * b.odds - b.stake, 4)
                ELSE round(-b.stake, 4)
              END
            WHEN 'void'::public.bet_status THEN 0::numeric
            WHEN 'cashout'::public.bet_status THEN round(coalesce(b.profit, 0), 4)
            ELSE 0::numeric
          END
        )::numeric
        FROM public.bets b
        WHERE b.user_id = auth.uid()
      ),
      0
    )
  );
$$;

COMMENT ON FUNCTION public.user_bets_settled_stats() IS
  'Conteggi P/L e stake refertato coerenti con betSettledPnL lato app; filtra su auth.uid().';

REVOKE ALL ON FUNCTION public.user_bets_settled_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_bets_settled_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_bets_settled_stats() TO service_role;

CREATE INDEX IF NOT EXISTS bets_user_placed_at_desc_idx
  ON public.bets (user_id, placed_at DESC);

CREATE INDEX IF NOT EXISTS bets_user_status_idx
  ON public.bets (user_id, status);

CREATE INDEX IF NOT EXISTS gaming_accounts_user_identity_idx
  ON public.gaming_accounts (user_id, identity_id);

CREATE INDEX IF NOT EXISTS stakers_user_player_idx
  ON public.stakers (user_id, player_id);

CREATE INDEX IF NOT EXISTS transactions_user_created_idx
  ON public.transactions (user_id, created_at DESC);
