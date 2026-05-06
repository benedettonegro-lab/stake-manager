-- Transazioni: player_id obbligatorio; stato unificato (pending/completed/rejected)
-- per depositi e prelievi. Saldi aggiornati solo se status = completed.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS player_id uuid REFERENCES public.players (id) ON DELETE RESTRICT;

UPDATE public.transactions t
SET player_id = ga.player_id
FROM public.gaming_accounts ga
WHERE ga.id = t.gaming_account_id
  AND t.player_id IS NULL;

ALTER TABLE public.transactions
  ALTER COLUMN player_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_player_id_idx ON public.transactions (player_id);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS status public.transaction_fulfillment_status;

UPDATE public.transactions
SET status = COALESCE(
  fulfillment_status,
  'completed'::public.transaction_fulfillment_status
);

UPDATE public.transactions
SET status = 'completed'::public.transaction_fulfillment_status
WHERE status IS NULL;

ALTER TABLE public.transactions
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.transactions
  ALTER COLUMN status SET DEFAULT 'completed'::public.transaction_fulfillment_status;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_deposit_fulfillment_null;

ALTER TABLE public.transactions
  DROP COLUMN IF EXISTS fulfillment_status;

ALTER TYPE public.transaction_fulfillment_status RENAME TO transaction_status;

COMMENT ON COLUMN public.transactions.status IS
  'pending / completed / rejected. Solo completed aggiorna saldi conto gioco e metodo.';

COMMENT ON COLUMN public.transactions.player_id IS
  'Identità (player) della transazione; deve coincidere con conto e metodo.';

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

  IF NEW.player_id IS NULL THEN
    NEW.player_id := acc_player;
  ELSIF NEW.player_id IS DISTINCT FROM acc_player OR NEW.player_id IS DISTINCT FROM pm_player THEN
    RAISE EXCEPTION 'player_id deve coincidere con conto gioco e metodo di pagamento';
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
  IF NEW.status IS DISTINCT FROM 'completed'::public.transaction_status THEN
    RETURN NEW;
  END IF;

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
        AND (
          pm.gaming_account_id IS NULL
          OR pm.gaming_account_id = gaming_account_id
        )
    )
  );
