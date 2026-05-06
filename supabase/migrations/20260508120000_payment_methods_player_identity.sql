-- Metodi di pagamento collegati all'identità (player): player_id obbligatorio;
-- gaming_account_id opzionale (NULL = metodo a livello identità, usabile su tutti i conti dello stesso player).

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS player_id uuid REFERENCES public.players (id) ON DELETE CASCADE;

UPDATE public.payment_methods pm
SET player_id = ga.player_id
FROM public.gaming_accounts ga
WHERE ga.id = pm.gaming_account_id
  AND pm.player_id IS NULL;

ALTER TABLE public.payment_methods
  ALTER COLUMN player_id SET NOT NULL;

ALTER TABLE public.payment_methods
  ALTER COLUMN gaming_account_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS payment_methods_player_id_idx ON public.payment_methods (player_id);

COMMENT ON COLUMN public.payment_methods.player_id IS 'Identità (player) a cui appartiene il metodo.';
COMMENT ON COLUMN public.payment_methods.gaming_account_id IS 'Opzionale: se valorizzato, il metodo era legato a un conto specifico; NULL = metodo condiviso per tutti i conti del player.';

-- Allinea user_id / player_id quando c''è un conto
CREATE OR REPLACE FUNCTION public.enforce_payment_method_user_matches_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  acc_user uuid;
  acc_player uuid;
  pl_user uuid;
BEGIN
  IF NEW.gaming_account_id IS NOT NULL THEN
    SELECT user_id, player_id INTO acc_user, acc_player
    FROM public.gaming_accounts
    WHERE id = NEW.gaming_account_id;
    IF acc_user IS NULL THEN
      RAISE EXCEPTION 'gaming_account_id non valido';
    END IF;
    IF NEW.user_id IS DISTINCT FROM acc_user THEN
      RAISE EXCEPTION 'user_id deve coincidere con gaming_accounts.user_id';
    END IF;
    IF NEW.player_id IS NULL THEN
      NEW.player_id := acc_player;
    ELSIF NEW.player_id IS DISTINCT FROM acc_player THEN
      RAISE EXCEPTION 'player_id deve coincidere con il player del conto gioco';
    END IF;
  ELSE
    IF NEW.player_id IS NULL THEN
      RAISE EXCEPTION 'player_id obbligatorio per metodi senza conto';
    END IF;
    SELECT user_id INTO pl_user FROM public.players WHERE id = NEW.player_id;
    IF pl_user IS NULL THEN
      RAISE EXCEPTION 'player_id non valido';
    END IF;
    IF NEW.user_id IS DISTINCT FROM pl_user THEN
      RAISE EXCEPTION 'user_id deve coincidere con players.user_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_methods_enforce_user_account ON public.payment_methods;

CREATE TRIGGER payment_methods_enforce_user_account
  BEFORE INSERT OR UPDATE OF user_id, gaming_account_id, player_id ON public.payment_methods
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
  pm_account uuid;
  pm_player uuid;
BEGIN
  SELECT user_id, player_id INTO acc_user, acc_player
  FROM public.gaming_accounts
  WHERE id = NEW.gaming_account_id;

  SELECT user_id, gaming_account_id, player_id INTO pm_user, pm_account, pm_player
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

  IF pm_account IS NOT NULL AND pm_account IS DISTINCT FROM NEW.gaming_account_id THEN
    RAISE EXCEPTION 'Il metodo di pagamento non appartiene al conto gioco indicato';
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
  SELECT id, user_id, player_id, current_balance
  INTO acc
  FROM public.gaming_accounts
  WHERE id = NEW.gaming_account_id
  FOR UPDATE;

  SELECT id, user_id, gaming_account_id, player_id, current_balance
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

  IF pm.gaming_account_id IS NOT NULL AND pm.gaming_account_id IS DISTINCT FROM NEW.gaming_account_id THEN
    RAISE EXCEPTION 'Metodo di pagamento non collegato a questo conto gioco';
  END IF;

  IF NEW.kind = 'deposit'::public.transaction_kind THEN
    IF pm.current_balance < NEW.amount THEN
      RAISE EXCEPTION 'Saldo metodo di pagamento insufficiente (deposito)';
    END IF;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance + NEW.amount
    WHERE id = acc.id;

    UPDATE public.payment_methods
    SET current_balance = current_balance - NEW.amount
    WHERE id = pm.id;
  ELSIF NEW.kind = 'withdrawal'::public.transaction_kind THEN
    IF NEW.fulfillment_status IS NOT NULL
      AND NEW.fulfillment_status <> 'completed'::public.transaction_fulfillment_status THEN
      RETURN NEW;
    END IF;

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

DROP POLICY IF EXISTS payment_methods_insert_own ON public.payment_methods;
DROP POLICY IF EXISTS payment_methods_update_own ON public.payment_methods;

CREATE POLICY payment_methods_insert_own ON public.payment_methods
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.gaming_accounts ga
        WHERE ga.id = gaming_account_id AND ga.user_id = auth.uid()
      )
      OR (
        gaming_account_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.players p
          WHERE p.id = player_id AND p.user_id = auth.uid()
        )
      )
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
    AND (
      gaming_account_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.gaming_accounts ga
        WHERE ga.id = gaming_account_id
          AND ga.user_id = auth.uid()
          AND ga.player_id = player_id
      )
    )
  );

DROP POLICY IF EXISTS transactions_insert_own ON public.transactions;

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
        AND pm.player_id = (
          SELECT ga2.player_id FROM public.gaming_accounts ga2 WHERE ga2.id = gaming_account_id
        )
        AND (
          pm.gaming_account_id IS NULL
          OR pm.gaming_account_id = gaming_account_id
        )
    )
  );

GRANT UPDATE (player_id) ON public.payment_methods TO authenticated;
