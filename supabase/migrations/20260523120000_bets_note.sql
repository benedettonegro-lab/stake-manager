-- Note opzionali sulla singola giocata (dettaglio / modifica da app)
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN public.bets.note IS 'Note libere sulla giocata (opzionale).';

GRANT UPDATE (note) ON public.bets TO authenticated;
