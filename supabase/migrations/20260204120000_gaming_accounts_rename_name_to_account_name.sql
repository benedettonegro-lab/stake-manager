-- Progetti già migrati con colonna `name` su gaming_accounts → `account_name`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gaming_accounts'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE public.gaming_accounts RENAME COLUMN name TO account_name;
  END IF;
END $$;
