-- Bookmakers: anagrafica per utente; gaming_accounts.bookmaker_id + campo testuale legacy `bookmaker`.

CREATE TABLE public.bookmakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bookmakers_user_id_idx ON public.bookmakers (user_id);

CREATE TRIGGER bookmakers_set_updated_at
  BEFORE UPDATE ON public.bookmakers
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.gaming_accounts
  ADD COLUMN IF NOT EXISTS bookmaker_id uuid REFERENCES public.bookmakers (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gaming_accounts_bookmaker_id_idx ON public.gaming_accounts (bookmaker_id);

-- Allinea il nome testuale quando è valorizzato bookmaker_id (compatibilità con UI che legge `bookmaker`)
CREATE OR REPLACE FUNCTION public.gaming_accounts_sync_bookmaker_from_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  bm_name text;
BEGIN
  IF NEW.bookmaker_id IS NOT NULL THEN
    SELECT b.name INTO bm_name FROM public.bookmakers b WHERE b.id = NEW.bookmaker_id;
    IF bm_name IS NOT NULL THEN
      NEW.bookmaker := bm_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gaming_accounts_sync_bookmaker_from_id_trigger ON public.gaming_accounts;

CREATE TRIGGER gaming_accounts_sync_bookmaker_from_id_trigger
  BEFORE INSERT OR UPDATE OF bookmaker_id ON public.gaming_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.gaming_accounts_sync_bookmaker_from_id();

ALTER TABLE public.bookmakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY bookmakers_select_own ON public.bookmakers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY bookmakers_insert_own ON public.bookmakers
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY bookmakers_update_own ON public.bookmakers
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY bookmakers_delete_own ON public.bookmakers
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS gaming_accounts_insert_own ON public.gaming_accounts;
DROP POLICY IF EXISTS gaming_accounts_update_own ON public.gaming_accounts;

CREATE POLICY gaming_accounts_insert_own ON public.gaming_accounts
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_id AND p.user_id = auth.uid()
    )
    AND (
      bookmaker_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.bookmakers b
        WHERE b.id = bookmaker_id AND b.user_id = auth.uid()
      )
    )
  );

CREATE POLICY gaming_accounts_update_own ON public.gaming_accounts
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_id AND p.user_id = auth.uid()
    )
    AND (
      bookmaker_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.bookmakers b
        WHERE b.id = bookmaker_id AND b.user_id = auth.uid()
      )
    )
  );

GRANT SELECT, INSERT, DELETE ON public.bookmakers TO authenticated;
GRANT UPDATE (name, note) ON public.bookmakers TO authenticated;

GRANT ALL ON public.bookmakers TO postgres, service_role;
GRANT SELECT ON public.bookmakers TO anon;

REVOKE UPDATE (account_name, player_id, bookmaker, note) ON public.gaming_accounts FROM authenticated;
GRANT UPDATE (
  account_name,
  player_id,
  bookmaker,
  bookmaker_id,
  note,
  account_status,
  current_balance
) ON public.gaming_accounts TO authenticated;
