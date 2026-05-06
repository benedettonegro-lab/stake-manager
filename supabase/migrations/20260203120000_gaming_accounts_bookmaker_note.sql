-- Aggiunge bookmaker e note a gaming_accounts (progetti già migrati con lo schema precedente)
ALTER TABLE public.gaming_accounts
  ADD COLUMN IF NOT EXISTS bookmaker text NOT NULL DEFAULT '';

ALTER TABLE public.gaming_accounts
  ADD COLUMN IF NOT EXISTS note text;
