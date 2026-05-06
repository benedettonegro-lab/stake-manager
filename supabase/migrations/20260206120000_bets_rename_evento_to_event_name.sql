DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bets'
      AND column_name = 'evento'
  ) THEN
    ALTER TABLE public.bets RENAME COLUMN evento TO event_name;
  END IF;
END $$;
