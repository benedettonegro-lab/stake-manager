-- Staker: persona a cui attribuisci le giocate; referto aggiorna conto gioco + staker, non identità (players).

CREATE TABLE public.stakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players (id) ON DELETE SET NULL,
  name text NOT NULL,
  balance numeric(18, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX stakers_one_per_identity_idx
  ON public.stakers (player_id)
  WHERE player_id IS NOT NULL;

CREATE INDEX stakers_user_id_idx ON public.stakers (user_id);

CREATE TRIGGER stakers_set_updated_at
  BEFORE UPDATE ON public.stakers
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- Staker predefinito per ogni identità esistente (saldo migrato da players.balance)
INSERT INTO public.stakers (user_id, player_id, name, balance)
SELECT p.user_id, p.id, p.name, p.balance
FROM public.players p
WHERE NOT EXISTS (SELECT 1 FROM public.stakers s WHERE s.player_id = p.id);

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS staker_id uuid REFERENCES public.stakers (id) ON DELETE RESTRICT;

UPDATE public.bets b
SET staker_id = s.id
FROM public.stakers s
WHERE b.staker_id IS NULL
  AND s.player_id = b.player_id;

ALTER TABLE public.bets
  ALTER COLUMN staker_id SET NOT NULL;

-- Nuove identità: staker predefinito collegato
CREATE OR REPLACE FUNCTION public.players_create_default_staker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stakers (user_id, player_id, name, balance)
  VALUES (NEW.user_id, NEW.id, NEW.name, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_create_default_staker_trigger ON public.players;

CREATE TRIGGER players_create_default_staker_trigger
  AFTER INSERT ON public.players
  FOR EACH ROW
  EXECUTE PROCEDURE public.players_create_default_staker();

-- Coerenza scommessa: identità dal conto; staker dell'utente
CREATE OR REPLACE FUNCTION public.bets_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  acc_user uuid;
  acc_player uuid;
  sk_user uuid;
BEGIN
  SELECT ga.user_id, ga.player_id
  INTO acc_user, acc_player
  FROM public.gaming_accounts ga
  WHERE ga.id = NEW.gaming_account_id;

  IF acc_user IS NULL THEN
    RAISE EXCEPTION 'Conto gioco non trovato';
  END IF;

  IF NEW.user_id IS DISTINCT FROM acc_user THEN
    RAISE EXCEPTION 'user_id deve coincidere con il conto gioco';
  END IF;

  NEW.player_id := acc_player;

  SELECT s.user_id INTO sk_user
  FROM public.stakers s
  WHERE s.id = NEW.staker_id;

  IF sk_user IS NULL THEN
    RAISE EXCEPTION 'staker_id non valido';
  END IF;

  IF NEW.user_id IS DISTINCT FROM sk_user THEN
    RAISE EXCEPTION 'Lo staker non appartiene all''utente';
  END IF;

  IF NEW.status = 'open'::public.bet_status THEN
    NEW.profit := 0;
  ELSIF NEW.status = 'won'::public.bet_status THEN
    NEW.profit := round(NEW.stake * NEW.odds - NEW.stake, 4);
  ELSIF NEW.status = 'lost'::public.bet_status THEN
    NEW.profit := round(-NEW.stake, 4);
  ELSIF NEW.status = 'void'::public.bet_status THEN
    NEW.profit := 0;
  ELSIF NEW.status = 'cashout'::public.bet_status THEN
    NEW.profit := 0;
  ELSE
    NEW.profit := 0;
  END IF;

  RETURN NEW;
END;
$$;

-- Referto: solo conto gioco + staker (mai players.balance)
CREATE OR REPLACE FUNCTION public.bets_apply_settlement_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_eff numeric(18, 4);
  new_eff numeric(18, 4);
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_eff := CASE
      WHEN NEW.status IN ('won'::public.bet_status, 'lost'::public.bet_status) THEN NEW.profit
      ELSE 0
    END;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance + new_eff
    WHERE id = NEW.gaming_account_id;
    UPDATE public.stakers
    SET balance = balance + new_eff
    WHERE id = NEW.staker_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    old_eff := CASE
      WHEN OLD.status IN ('won'::public.bet_status, 'lost'::public.bet_status) THEN OLD.profit
      ELSE 0
    END;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance - old_eff
    WHERE id = OLD.gaming_account_id;
    UPDATE public.stakers
    SET balance = balance - old_eff
    WHERE id = OLD.staker_id;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER TABLE public.stakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY stakers_select_own ON public.stakers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY stakers_insert_own ON public.stakers
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY stakers_update_own ON public.stakers
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY stakers_delete_own ON public.stakers
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS bets_insert_own ON public.bets;
DROP POLICY IF EXISTS bets_update_own ON public.bets;

CREATE POLICY bets_insert_own ON public.bets
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.gaming_accounts ga
      WHERE ga.id = gaming_account_id AND ga.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.stakers s
      WHERE s.id = staker_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY bets_update_own ON public.bets
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.gaming_accounts ga
      WHERE ga.id = gaming_account_id AND ga.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.stakers s
      WHERE s.id = staker_id AND s.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, DELETE ON public.stakers TO authenticated;
GRANT UPDATE (name, balance, player_id) ON public.stakers TO authenticated;

GRANT ALL ON public.stakers TO postgres, service_role;

GRANT SELECT ON public.stakers TO anon;

REVOKE UPDATE (balance) ON public.players FROM authenticated;

GRANT UPDATE (staker_id) ON public.bets TO authenticated;

CREATE OR REPLACE FUNCTION public.players_sync_default_staker_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.stakers SET name = NEW.name WHERE player_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_sync_default_staker_name_trigger ON public.players;

CREATE TRIGGER players_sync_default_staker_name_trigger
  AFTER UPDATE OF name ON public.players
  FOR EACH ROW
  EXECUTE PROCEDURE public.players_sync_default_staker_name();
