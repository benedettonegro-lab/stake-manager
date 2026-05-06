-- =============================================================================
-- Stake Manager — schema completo per Supabase (PostgreSQL)
-- Esegui dalla SQL Editor del dashboard o con: supabase db push / migration
-- =============================================================================

-- Enum transazioni (evita la parola riservata TYPE)
CREATE TYPE public.transaction_kind AS ENUM ('deposit', 'withdrawal');

CREATE TYPE public.bet_status AS ENUM (
  'open',
  'won',
  'lost',
  'void',
  'cashout'
);

-- -----------------------------------------------------------------------------
-- players: clienti / ID giocatore (per utente autenticato)
-- -----------------------------------------------------------------------------
CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  note text,
  balance numeric(18, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX players_user_id_idx ON public.players (user_id);

COMMENT ON TABLE public.players IS 'Clienti / ID collegati all''utente auth';

-- -----------------------------------------------------------------------------
-- gaming_accounts: conti gioco per player
-- -----------------------------------------------------------------------------
CREATE TABLE public.gaming_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players (id) ON DELETE CASCADE,
  account_name text NOT NULL,
  bookmaker text NOT NULL DEFAULT '',
  note text,
  initial_balance numeric(18, 4) NOT NULL DEFAULT 0 CHECK (initial_balance >= 0),
  current_balance numeric(18, 4) NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gaming_accounts_user_matches_player CHECK (
    user_id = (SELECT p.user_id FROM public.players p WHERE p.id = player_id)
  )
);

CREATE INDEX gaming_accounts_user_id_idx ON public.gaming_accounts (user_id);
CREATE INDEX gaming_accounts_player_id_idx ON public.gaming_accounts (player_id);

-- -----------------------------------------------------------------------------
-- payment_methods: metodi di pagamento per singolo conto gioco
-- -----------------------------------------------------------------------------
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  gaming_account_id uuid NOT NULL REFERENCES public.gaming_accounts (id) ON DELETE CASCADE,
  label text NOT NULL,
  current_balance numeric(18, 4) NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_methods_user_id_idx ON public.payment_methods (user_id);
CREATE INDEX payment_methods_gaming_account_id_idx ON public.payment_methods (gaming_account_id);

-- -----------------------------------------------------------------------------
-- transactions: depositi e prelievi (saldi aggiornati da trigger)
-- -----------------------------------------------------------------------------
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  gaming_account_id uuid NOT NULL REFERENCES public.gaming_accounts (id) ON DELETE RESTRICT,
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods (id) ON DELETE RESTRICT,
  kind public.transaction_kind NOT NULL,
  amount numeric(18, 4) NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transactions_user_id_idx ON public.transactions (user_id);
CREATE INDEX transactions_gaming_account_id_idx ON public.transactions (gaming_account_id);
CREATE INDEX transactions_payment_method_id_idx ON public.transactions (payment_method_id);
CREATE INDEX transactions_created_at_idx ON public.transactions (created_at DESC);

-- -----------------------------------------------------------------------------
-- bets: scommesse (conto usato + persona per cui si gioca; profit da trigger)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players (id) ON DELETE CASCADE,
  gaming_account_id uuid NOT NULL REFERENCES public.gaming_accounts (id) ON DELETE CASCADE,
  event_name text NOT NULL DEFAULT '',
  odds numeric(18, 6) NOT NULL CHECK (odds > 0),
  stake numeric(18, 4) NOT NULL CHECK (stake > 0),
  status public.bet_status NOT NULL DEFAULT 'open',
  profit numeric(18, 4) NOT NULL DEFAULT 0,
  placed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bets_user_id_idx ON public.bets (user_id);
CREATE INDEX bets_player_id_idx ON public.bets (player_id);
CREATE INDEX bets_gaming_account_id_idx ON public.bets (gaming_account_id);

-- =============================================================================
-- Funzioni trigger: updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER players_set_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER gaming_accounts_set_updated_at
  BEFORE UPDATE ON public.gaming_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER payment_methods_set_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- =============================================================================
-- Coerenza user_id (player ↔ account ↔ metodo ↔ transazione ↔ scommessa)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enforce_gaming_account_user_matches_player()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  p_user uuid;
BEGIN
  SELECT user_id INTO p_user FROM public.players WHERE id = NEW.player_id;
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'player_id non valido';
  END IF;
  IF NEW.user_id IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'user_id deve coincidere con players.user_id per questo player_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gaming_accounts_enforce_user_player
  BEFORE INSERT OR UPDATE OF user_id, player_id ON public.gaming_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_gaming_account_user_matches_player();

CREATE OR REPLACE FUNCTION public.enforce_payment_method_user_matches_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  acc_user uuid;
BEGIN
  SELECT user_id INTO acc_user FROM public.gaming_accounts WHERE id = NEW.gaming_account_id;
  IF acc_user IS NULL THEN
    RAISE EXCEPTION 'gaming_account_id non valido';
  END IF;
  IF NEW.user_id IS DISTINCT FROM acc_user THEN
    RAISE EXCEPTION 'user_id deve coincidere con gaming_accounts.user_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_methods_enforce_user_account
  BEFORE INSERT OR UPDATE OF user_id, gaming_account_id ON public.payment_methods
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_payment_method_user_matches_account();

CREATE OR REPLACE FUNCTION public.enforce_transaction_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  acc_user uuid;
  pm_user uuid;
  pm_account uuid;
BEGIN
  SELECT user_id INTO acc_user FROM public.gaming_accounts WHERE id = NEW.gaming_account_id;
  SELECT user_id, gaming_account_id INTO pm_user, pm_account
  FROM public.payment_methods WHERE id = NEW.payment_method_id;

  IF acc_user IS NULL OR pm_user IS NULL THEN
    RAISE EXCEPTION 'Conto gioco o metodo di pagamento non trovato';
  END IF;

  IF NEW.user_id IS DISTINCT FROM acc_user OR NEW.user_id IS DISTINCT FROM pm_user THEN
    RAISE EXCEPTION 'user_id deve coincidere con conto e metodo di pagamento';
  END IF;

  IF pm_account IS DISTINCT FROM NEW.gaming_account_id THEN
    RAISE EXCEPTION 'Il metodo di pagamento non appartiene al conto gioco indicato';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_enforce_refs
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_transaction_refs();

CREATE OR REPLACE FUNCTION public.bets_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  acc_user uuid;
  pl_user uuid;
BEGIN
  SELECT user_id INTO acc_user FROM public.gaming_accounts WHERE id = NEW.gaming_account_id;
  SELECT user_id INTO pl_user FROM public.players WHERE id = NEW.player_id;

  IF acc_user IS NULL OR pl_user IS NULL THEN
    RAISE EXCEPTION 'Conto gioco o player non trovato';
  END IF;

  IF NEW.user_id IS DISTINCT FROM acc_user OR NEW.user_id IS DISTINCT FROM pl_user THEN
    RAISE EXCEPTION 'user_id deve coincidere con gaming_accounts e players';
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

CREATE TRIGGER bets_before_write_trigger
  BEFORE INSERT OR UPDATE ON public.bets
  FOR EACH ROW
  EXECUTE PROCEDURE public.bets_before_write();

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
    UPDATE public.players
    SET balance = balance + new_eff
    WHERE id = NEW.player_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_eff := CASE
      WHEN OLD.status IN ('won'::public.bet_status, 'lost'::public.bet_status) THEN OLD.profit
      ELSE 0
    END;
    new_eff := CASE
      WHEN NEW.status IN ('won'::public.bet_status, 'lost'::public.bet_status) THEN NEW.profit
      ELSE 0
    END;

    IF OLD.gaming_account_id IS NOT DISTINCT FROM NEW.gaming_account_id
      AND OLD.player_id IS NOT DISTINCT FROM NEW.player_id THEN
      UPDATE public.gaming_accounts
      SET current_balance = current_balance + (new_eff - old_eff)
      WHERE id = NEW.gaming_account_id;
      UPDATE public.players
      SET balance = balance + (new_eff - old_eff)
      WHERE id = NEW.player_id;
    ELSE
      UPDATE public.gaming_accounts
      SET current_balance = current_balance - old_eff
      WHERE id = OLD.gaming_account_id;
      UPDATE public.players
      SET balance = balance - old_eff
      WHERE id = OLD.player_id;
      UPDATE public.gaming_accounts
      SET current_balance = current_balance + new_eff
      WHERE id = NEW.gaming_account_id;
      UPDATE public.players
      SET balance = balance + new_eff
      WHERE id = NEW.player_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bets_apply_settlement_balances_trigger
  AFTER INSERT OR UPDATE ON public.bets
  FOR EACH ROW
  EXECUTE PROCEDURE public.bets_apply_settlement_balances();

-- =============================================================================
-- Nuovo conto gioco: current_balance = initial_balance
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gaming_account_init_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.current_balance := NEW.initial_balance;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gaming_accounts_init_balance
  BEFORE INSERT ON public.gaming_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.gaming_account_init_balance();

-- =============================================================================
-- Deposito / prelievo: aggiorna saldi (dopo INSERT su transactions)
-- deposit: + conto gioco, - metodo pagamento
-- withdrawal: - conto gioco, + metodo pagamento
-- =============================================================================
CREATE OR REPLACE FUNCTION public.apply_transaction_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acc record;
  pm record;
BEGIN
  SELECT id, user_id, current_balance
  INTO acc
  FROM public.gaming_accounts
  WHERE id = NEW.gaming_account_id
  FOR UPDATE;

  SELECT id, user_id, gaming_account_id, current_balance
  INTO pm
  FROM public.payment_methods
  WHERE id = NEW.payment_method_id
  FOR UPDATE;

  IF acc.id IS NULL OR pm.id IS NULL THEN
    RAISE EXCEPTION 'Conto o metodo non trovato';
  END IF;

  IF pm.gaming_account_id IS DISTINCT FROM NEW.gaming_account_id THEN
    RAISE EXCEPTION 'Metodo di pagamento non collegato a questo conto gioco';
  END IF;

  IF NEW.kind = 'deposit' THEN
    IF pm.current_balance < NEW.amount THEN
      RAISE EXCEPTION 'Saldo metodo di pagamento insufficiente (deposito)';
    END IF;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance + NEW.amount
    WHERE id = acc.id;

    UPDATE public.payment_methods
    SET current_balance = current_balance - NEW.amount
    WHERE id = pm.id;
  ELSIF NEW.kind = 'withdrawal' THEN
    IF acc.current_balance < NEW.amount THEN
      RAISE EXCEPTION 'Saldo conto gioco insufficiente (prelievo)';
    END IF;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance - NEW.amount
    WHERE id = acc.id;

    UPDATE public.payment_methods
    SET current_balance = current_balance + NEW.amount
    WHERE id = pm.id;
  ELSE
    RAISE EXCEPTION 'Tipo transazione non gestito: %', NEW.kind;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_apply_balances
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE PROCEDURE public.apply_transaction_balances();

COMMENT ON FUNCTION public.apply_transaction_balances() IS
  'Deposito: +gaming_accounts.current_balance, -payment_methods.current_balance. Prelievo: inverso.';

-- =============================================================================
-- Row Level Security
-- =============================================================================
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gaming_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

-- players
CREATE POLICY players_select_own ON public.players
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY players_insert_own ON public.players
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY players_update_own ON public.players
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY players_delete_own ON public.players
  FOR DELETE USING (user_id = auth.uid());

-- gaming_accounts
CREATE POLICY gaming_accounts_select_own ON public.gaming_accounts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY gaming_accounts_insert_own ON public.gaming_accounts
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_id AND p.user_id = auth.uid()
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
  );

CREATE POLICY gaming_accounts_delete_own ON public.gaming_accounts
  FOR DELETE USING (user_id = auth.uid());

-- payment_methods
CREATE POLICY payment_methods_select_own ON public.payment_methods
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY payment_methods_insert_own ON public.payment_methods
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.gaming_accounts ga
      WHERE ga.id = gaming_account_id AND ga.user_id = auth.uid()
    )
  );

CREATE POLICY payment_methods_update_own ON public.payment_methods
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.gaming_accounts ga
      WHERE ga.id = gaming_account_id AND ga.user_id = auth.uid()
    )
  );

CREATE POLICY payment_methods_delete_own ON public.payment_methods
  FOR DELETE USING (user_id = auth.uid());

-- transactions: solo lettura e inserimento (modifiche manuali romperebbero i saldi)
CREATE POLICY transactions_select_own ON public.transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY transactions_insert_own ON public.transactions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.gaming_accounts ga
      WHERE ga.id = gaming_account_id AND ga.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.payment_methods pm
      WHERE pm.id = payment_method_id
        AND pm.user_id = auth.uid()
        AND pm.gaming_account_id = gaming_account_id
    )
  );

-- bets
CREATE POLICY bets_select_own ON public.bets
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY bets_insert_own ON public.bets
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.gaming_accounts ga
      WHERE ga.id = gaming_account_id AND ga.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_id AND p.user_id = auth.uid()
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
      SELECT 1 FROM public.players p
      WHERE p.id = player_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY bets_delete_own ON public.bets
  FOR DELETE USING (user_id = auth.uid());

-- =============================================================================
-- Grant (ruolo anon + authenticated come da default Supabase)
-- Saldi conto/metodi: trigger su transactions. Saldi conto + persona da
-- scommesse: trigger su bets (profit). balance su players e current_balance
-- gaming_accounts non sono nel GRANT UPDATE client.
-- =============================================================================
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;

GRANT SELECT, INSERT, DELETE ON public.players TO authenticated;
GRANT UPDATE (name, note) ON public.players TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.gaming_accounts TO authenticated;
GRANT UPDATE (account_name, player_id, bookmaker, note) ON public.gaming_accounts TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.payment_methods TO authenticated;
GRANT UPDATE (label) ON public.payment_methods TO authenticated;

GRANT SELECT, INSERT ON public.transactions TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.bets TO authenticated;
GRANT UPDATE (
  player_id,
  gaming_account_id,
  event_name,
  odds,
  stake,
  status
) ON public.bets TO authenticated;

GRANT SELECT ON public.players TO anon;
GRANT SELECT ON public.gaming_accounts TO anon;
GRANT SELECT ON public.payment_methods TO anon;
GRANT SELECT ON public.transactions TO anon;
GRANT SELECT ON public.bets TO anon;

GRANT USAGE ON TYPE public.transaction_kind TO postgres, anon, authenticated, service_role;
GRANT USAGE ON TYPE public.bet_status TO postgres, anon, authenticated, service_role;

-- Le funzioni trigger sono invocate dal sistema; apply_transaction_balances è SECURITY DEFINER
-- per aggiornare i saldi anche con RLS attivo sulle tabelle.

-- =============================================================================
-- Esempio ordine operazioni (JWT utente = user_id ovunque)
-- =============================================================================
-- INSERT INTO public.players (user_id, name) VALUES (auth.uid(), 'Cliente 1');
-- INSERT INTO public.gaming_accounts (user_id, player_id, account_name, bookmaker, initial_balance)
--   VALUES (auth.uid(), '<player_uuid>', 'Conto principale', 'Bet365', 1000);
-- INSERT INTO public.payment_methods (user_id, gaming_account_id, label, current_balance)
--   VALUES (auth.uid(), '<account_uuid>', 'Skrill', 5000);
-- INSERT INTO public.transactions (user_id, gaming_account_id, payment_method_id, kind, amount)
--   VALUES (auth.uid(), '<account_uuid>', '<pm_uuid>', 'deposit', 100);
-- INSERT INTO public.bets (user_id, player_id, gaming_account_id, event_name, odds, stake, status)
--   VALUES (auth.uid(), '<player_uuid>', '<account_uuid>', 'Juventus-Inter', 2.10, 50, 'won');
