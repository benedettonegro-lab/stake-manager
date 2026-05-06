-- bets: colonna timestamp della giocata (allineamento nome colonna)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bets'
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.bets RENAME COLUMN created_at TO placed_at;
  END IF;
END;
$$;
