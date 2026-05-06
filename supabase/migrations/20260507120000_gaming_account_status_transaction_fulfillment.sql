-- Stato conto gioco + esito prelievo (pending/completed/rejected) senza movimentare saldi se non completed.

DO $$
BEGIN
  CREATE TYPE public.gaming_account_status AS ENUM ('active', 'paused', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.gaming_accounts
  ADD COLUMN IF NOT EXISTS account_status public.gaming_account_status NOT NULL DEFAULT 'active';

DO $$
BEGIN
  CREATE TYPE public.transaction_fulfillment_status AS ENUM (
    'pending',
    'completed',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS fulfillment_status public.transaction_fulfillment_status NULL;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_deposit_fulfillment_null;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_deposit_fulfillment_null
  CHECK (kind <> 'deposit'::public.transaction_kind OR fulfillment_status IS NULL);

COMMENT ON COLUMN public.transactions.fulfillment_status IS
  'Deposito: sempre NULL. Prelievo: NULL = comportamento legacy (applica saldi). pending/rejected = solo registro; completed = applica saldi.';

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

GRANT UPDATE (account_status) ON public.gaming_accounts TO authenticated;
