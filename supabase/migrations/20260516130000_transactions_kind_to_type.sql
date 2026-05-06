-- transactions: colonna kind rinominata in type (valori: deposit, withdrawal tramite enum transaction_kind).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'kind'
  ) THEN
    ALTER TABLE public.transactions RENAME COLUMN kind TO type;
  END IF;
END $$;

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

  IF NEW.type = 'deposit'::public.transaction_kind THEN
    IF pm.balance < NEW.amount THEN
      RAISE EXCEPTION 'Saldo metodo di pagamento insufficiente (deposito)';
    END IF;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance + NEW.amount
    WHERE id = acc.id;

    UPDATE public.payment_methods
    SET balance = balance - NEW.amount
    WHERE id = pm.id;
  ELSIF NEW.type = 'withdrawal'::public.transaction_kind THEN
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
    RAISE EXCEPTION 'Tipo transazione non gestito: %', NEW.type;
  END IF;

  RETURN NEW;
END;
$$;
