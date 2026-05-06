-- transactions: colonna testo libero rinominata notes -> note (allineamento schema / client).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'notes'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'note'
  ) THEN
    ALTER TABLE public.transactions RENAME COLUMN notes TO note;
  END IF;
END $$;
