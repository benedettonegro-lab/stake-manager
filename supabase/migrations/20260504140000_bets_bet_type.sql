-- Tipologia schedina (default Singola)
ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS bet_type text NOT NULL DEFAULT 'Singola';

COMMENT ON COLUMN public.bets.bet_type IS 'Tipologia giocata (es. Singola, Multipla).';

GRANT UPDATE (bet_type) ON public.bets TO authenticated;
