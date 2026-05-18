-- Raccomandazioni indici per 100k+ bets e migliaia di conti.
-- Eseguire in Supabase SQL Editor (non modifica schema app automaticamente).

-- Giocate: keyset pagination (placed_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS bets_user_placed_id_desc_idx
  ON public.bets (user_id, placed_at DESC, id DESC);

-- Giocate: filtri per conto
CREATE INDEX IF NOT EXISTS bets_user_gaming_account_placed_idx
  ON public.bets (user_id, gaming_account_id, placed_at DESC);

-- Conti gioco: keyset pagination alfabetica
CREATE INDEX IF NOT EXISTS gaming_accounts_user_name_id_idx
  ON public.gaming_accounts (user_id, account_name ASC, id ASC);

-- Conti: lookup saldi
CREATE INDEX IF NOT EXISTS gaming_accounts_user_id_idx
  ON public.gaming_accounts (user_id, id);

-- Profili gate auth
CREATE INDEX IF NOT EXISTS profiles_id_status_idx
  ON public.profiles (id, status);

-- ANALYZE dopo creazione indici su tabelle grandi:
-- ANALYZE public.bets;
-- ANALYZE public.gaming_accounts;
