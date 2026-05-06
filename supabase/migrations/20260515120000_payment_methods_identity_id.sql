-- Identità = players.id: identity_id su payment_methods (uguale a player_id).

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS identity_id uuid;

UPDATE public.payment_methods pm
SET identity_id = pm.player_id
WHERE pm.identity_id IS NULL;

ALTER TABLE public.payment_methods
  ALTER COLUMN identity_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_methods_identity_id_fkey'
  ) THEN
    ALTER TABLE public.payment_methods
      ADD CONSTRAINT payment_methods_identity_id_fkey
      FOREIGN KEY (identity_id) REFERENCES public.players (id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_methods_identity_eq_player'
  ) THEN
    ALTER TABLE public.payment_methods
      ADD CONSTRAINT payment_methods_identity_eq_player CHECK (identity_id = player_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.payment_methods_identity_follows_player()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.identity_id := NEW.player_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_methods_identity_follows_player_trg ON public.payment_methods;
CREATE TRIGGER payment_methods_identity_follows_player_trg
  BEFORE INSERT OR UPDATE ON public.payment_methods
  FOR EACH ROW
  EXECUTE PROCEDURE public.payment_methods_identity_follows_player();

REVOKE UPDATE ON public.payment_methods FROM authenticated;
GRANT UPDATE (label, balance, "type", note, player_id, identity_id)
  ON public.payment_methods TO authenticated;
