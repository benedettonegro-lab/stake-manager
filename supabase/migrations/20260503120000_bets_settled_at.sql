-- Referto scommesse: timestamp chiusura
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS settled_at timestamptz;

COMMENT ON COLUMN public.bets.settled_at IS 'Momento del referto (won/lost/void/…); NULL se ancora aperta.';

-- Il trigger BEFORE ricalcola profit; serve privilegio UPDATE su profit e settled_at
GRANT UPDATE (settled_at, profit) ON public.bets TO authenticated;
