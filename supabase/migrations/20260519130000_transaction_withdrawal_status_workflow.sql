-- Prelievi: stato cancelled + aggiornamento saldi pending→completed + storno su DELETE completed.

DO $enum$
BEGIN
  ALTER TYPE public.transaction_status ADD VALUE 'cancelled';
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$enum$;

-- Solo status modificabile (altri campi devono restare uguali).
CREATE OR REPLACE FUNCTION public.transactions_enforce_update_only_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.user_id IS DISTINCT FROM NEW.user_id
     OR OLD.player_id IS DISTINCT FROM NEW.player_id
     OR OLD.gaming_account_id IS DISTINCT FROM NEW.gaming_account_id
     OR OLD.payment_method_id IS DISTINCT FROM NEW.payment_method_id
     OR OLD.type IS DISTINCT FROM NEW.type
     OR OLD.amount IS DISTINCT FROM NEW.amount
     OR OLD.note IS DISTINCT FROM NEW.note
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'Solo status può essere aggiornato su questa transazione';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_enforce_update_only_status ON public.transactions;
CREATE TRIGGER transactions_enforce_update_only_status
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE PROCEDURE public.transactions_enforce_update_only_status();

-- pending → completed: applica saldi (stesso schema della INSERT completed).
CREATE OR REPLACE FUNCTION public.apply_transaction_balances_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acc record;
  pm record;
BEGIN
  IF OLD.status IS DISTINCT FROM 'pending'::public.transaction_status
     OR NEW.status IS DISTINCT FROM 'completed'::public.transaction_status THEN
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

DROP TRIGGER IF EXISTS transactions_apply_balances_on_update ON public.transactions;
CREATE TRIGGER transactions_apply_balances_on_update
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE PROCEDURE public.apply_transaction_balances_on_update();

COMMENT ON FUNCTION public.apply_transaction_balances_on_update() IS
  'pending→completed: applica movimento saldi (deposito o prelievo). Altri passaggi di stato non toccano i saldi.';

-- DELETE: storno se era completed (deposito o prelievo).
CREATE OR REPLACE FUNCTION public.reverse_transaction_balances_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acc record;
  pm record;
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed'::public.transaction_status THEN
    RETURN OLD;
  END IF;

  SELECT id, user_id, player_id, current_balance
  INTO acc
  FROM public.gaming_accounts
  WHERE id = OLD.gaming_account_id
  FOR UPDATE;

  SELECT id, user_id, player_id, balance
  INTO pm
  FROM public.payment_methods
  WHERE id = OLD.payment_method_id
  FOR UPDATE;

  IF acc.id IS NULL OR pm.id IS NULL THEN
    RAISE EXCEPTION 'Conto o metodo non trovato per storno';
  END IF;

  IF OLD.type = 'deposit'::public.transaction_kind THEN
    IF acc.current_balance < OLD.amount THEN
      RAISE EXCEPTION 'Saldo conto gioco insufficiente per annullare il deposito';
    END IF;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance - OLD.amount
    WHERE id = acc.id;

    UPDATE public.payment_methods
    SET balance = balance + OLD.amount
    WHERE id = pm.id;
  ELSIF OLD.type = 'withdrawal'::public.transaction_kind THEN
    IF pm.balance < OLD.amount THEN
      RAISE EXCEPTION 'Saldo metodo insufficiente per annullare il prelievo';
    END IF;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance + OLD.amount
    WHERE id = acc.id;

    UPDATE public.payment_methods
    SET balance = balance - OLD.amount
    WHERE id = pm.id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS transactions_reverse_balances_before_delete ON public.transactions;
CREATE TRIGGER transactions_reverse_balances_before_delete
  BEFORE DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE PROCEDURE public.reverse_transaction_balances_before_delete();

COMMENT ON FUNCTION public.reverse_transaction_balances_before_delete() IS
  'Prima di eliminare una transazione completed, storna gli effetti su conto gioco e metodo.';

-- RLS: aggiorna solo prelievi in pending (→ completed / cancelled / rejected).
DROP POLICY IF EXISTS transactions_update_pending_withdrawal ON public.transactions;

CREATE POLICY transactions_update_pending_withdrawal ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND type = 'withdrawal'::public.transaction_kind
    AND status = 'pending'::public.transaction_status
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND type = 'withdrawal'::public.transaction_kind
    AND status IN (
      'completed'::public.transaction_status,
      'cancelled'::public.transaction_status,
      'rejected'::public.transaction_status
    )
  );

DROP POLICY IF EXISTS transactions_delete_own ON public.transactions;

CREATE POLICY transactions_delete_own ON public.transactions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT UPDATE (status) ON public.transactions TO authenticated;
GRANT DELETE ON public.transactions TO authenticated;

COMMENT ON COLUMN public.transactions.status IS
  'pending / completed / rejected / cancelled. Saldi: INSERT completed; UPDATE pending→completed; DELETE storna se completed.';
