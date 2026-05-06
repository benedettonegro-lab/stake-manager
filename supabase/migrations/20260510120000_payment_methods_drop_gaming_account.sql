-- Metodi di pagamento: solo identità (player_id). Rimozione gaming_account_id;
-- saldo in "balance", categoria in "type" (quoted), rimozione method_name.

DROP INDEX IF EXISTS public.payment_methods_gaming_account_id_idx;

ALTER TABLE public.payment_methods
  DROP COLUMN IF EXISTS gaming_account_id;

ALTER TABLE public.payment_methods
  RENAME COLUMN current_balance TO balance;

ALTER TABLE public.payment_methods
  RENAME COLUMN method_type TO "type";

ALTER TABLE public.payment_methods
  DROP COLUMN IF EXISTS method_name;

-- ---------------------------------------------------------------------------
-- Trigger / funzioni
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_payment_method_user_matches_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pl_user uuid;
BEGIN
  IF NEW.player_id IS NULL THEN
    RAISE EXCEPTION 'player_id obbligatorio per i metodi di pagamento';
  END IF;

  SELECT user_id INTO pl_user FROM public.players WHERE id = NEW.player_id;
  IF pl_user IS NULL THEN
    RAISE EXCEPTION 'player_id non valido';
  END IF;

  IF NEW.user_id IS DISTINCT FROM pl_user THEN
    RAISE EXCEPTION 'user_id deve coincidere con players.user_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_methods_enforce_user_account ON public.payment_methods;

CREATE TRIGGER payment_methods_enforce_user_account
  BEFORE INSERT OR UPDATE OF user_id, player_id ON public.payment_methods
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_payment_method_user_matches_account();

CREATE OR REPLACE FUNCTION public.enforce_transaction_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  acc_user uuid;
  acc_player uuid;
  pm_user uuid;
  pm_player uuid;
BEGIN
  SELECT user_id, player_id INTO acc_user, acc_player
  FROM public.gaming_accounts
  WHERE id = NEW.gaming_account_id;

  SELECT user_id, player_id INTO pm_user, pm_player
  FROM public.payment_methods
  WHERE id = NEW.payment_method_id;

  IF acc_user IS NULL OR pm_user IS NULL THEN
    RAISE EXCEPTION 'Conto gioco o metodo di pagamento non trovato';
  END IF;

  IF NEW.user_id IS DISTINCT FROM acc_user OR NEW.user_id IS DISTINCT FROM pm_user THEN
    RAISE EXCEPTION 'user_id deve coincidere con conto e metodo di pagamento';
  END IF;

  IF pm_player IS DISTINCT FROM acc_player THEN
    RAISE EXCEPTION 'Il metodo di pagamento non appartiene allo stesso cliente del conto gioco';
  END IF;

  IF NEW.player_id IS NULL THEN
    NEW.player_id := acc_player;
  ELSIF NEW.player_id IS DISTINCT FROM acc_player OR NEW.player_id IS DISTINCT FROM pm_player THEN
    RAISE EXCEPTION 'player_id deve coincidere con conto gioco e metodo di pagamento';
  END IF;

  RETURN NEW;
END;
$$;

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
  IF NEW.status IS DISTINCT FROM 'completed'::public.transaction_status THEN
    RETURN NEW;
  END IF;

  SELECT id, user_id, player_id, current_balance
  INTO acc
  FROM public.gaming_accounts
  WHERE id = NEW.gaming_account_id
  FOR UPDATE;

  SELECT id, user_id, player_id, balance
  INTO pm
  FROM public.payment_methods
  WHERE id = NEW.payment_method_id
  FOR UPDATE;

  IF acc.id IS NULL OR pm.id IS NULL THEN
    RAISE EXCEPTION 'Conto o metodo non trovato';
  END IF;

  IF pm.player_id IS DISTINCT FROM acc.player_id THEN
    RAISE EXCEPTION 'Metodo di pagamento non compatibile con il conto (player diverso)';
  END IF;

  IF NEW.kind = 'deposit'::public.transaction_kind THEN
    IF pm.balance < NEW.amount THEN
      RAISE EXCEPTION 'Saldo metodo di pagamento insufficiente (deposito)';
    END IF;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance + NEW.amount
    WHERE id = acc.id;

    UPDATE public.payment_methods
    SET balance = balance - NEW.amount
    WHERE id = pm.id;
  ELSIF NEW.kind = 'withdrawal'::public.transaction_kind THEN
    IF acc.current_balance < NEW.amount THEN
      RAISE EXCEPTION 'Saldo conto gioco insufficiente (prelievo)';
    END IF;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance - NEW.amount
    WHERE id = acc.id;

    UPDATE public.payment_methods
    SET balance = balance + NEW.amount
    WHERE id = pm.id;
  ELSE
    RAISE EXCEPTION 'Tipo transazione non gestito: %', NEW.kind;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS payment_methods
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS payment_methods_insert_own ON public.payment_methods;
DROP POLICY IF EXISTS payment_methods_update_own ON public.payment_methods;

CREATE POLICY payment_methods_insert_own ON public.payment_methods
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY payment_methods_update_own ON public.payment_methods
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_id AND p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- RLS transactions (niente collegamento pm ↔ conto)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS transactions_insert_own ON public.transactions;

CREATE POLICY transactions_insert_own ON public.transactions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.gaming_accounts ga
      WHERE ga.id = gaming_account_id
        AND ga.user_id = auth.uid()
        AND ga.player_id = player_id
    )
    AND EXISTS (
      SELECT 1 FROM public.payment_methods pm
      WHERE pm.id = payment_method_id
        AND pm.user_id = auth.uid()
        AND pm.player_id = player_id
    )
  );

-- ---------------------------------------------------------------------------
-- Grant aggiornati (balance / "type" al posto di current_balance / method_*)
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON public.payment_methods FROM authenticated;

GRANT UPDATE (label, balance, "type", note, player_id)
  ON public.payment_methods TO authenticated;
