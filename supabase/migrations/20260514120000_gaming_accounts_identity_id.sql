-- Identità = players.id: identity_id su gaming_accounts (stesso valore di player_id).

ALTER TABLE public.gaming_accounts
  ADD COLUMN IF NOT EXISTS identity_id uuid;

UPDATE public.gaming_accounts ga
SET identity_id = ga.player_id
WHERE ga.identity_id IS NULL;

ALTER TABLE public.gaming_accounts
  ALTER COLUMN identity_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gaming_accounts_identity_id_fkey'
  ) THEN
    ALTER TABLE public.gaming_accounts
      ADD CONSTRAINT gaming_accounts_identity_id_fkey
      FOREIGN KEY (identity_id) REFERENCES public.players (id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gaming_accounts_identity_eq_player'
  ) THEN
    ALTER TABLE public.gaming_accounts
      ADD CONSTRAINT gaming_accounts_identity_eq_player CHECK (identity_id = player_id);
  END IF;
END $$;

-- Mantieni identity_id allineato a player_id (es. UPDATE di player_id dal client).
CREATE OR REPLACE FUNCTION public.gaming_accounts_identity_follows_player()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.identity_id := NEW.player_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gaming_accounts_identity_follows_player_trg ON public.gaming_accounts;
CREATE TRIGGER gaming_accounts_identity_follows_player_trg
  BEFORE INSERT OR UPDATE ON public.gaming_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.gaming_accounts_identity_follows_player();
