-- Prelievi: ogni cambio stato ricalcola delta saldi (solo completed conta).
-- Sostituisce il vecchio trigger pending→completed su UPDATE.

DROP TRIGGER IF EXISTS transactions_apply_balances_on_update ON public.transactions;
DROP FUNCTION IF EXISTS public.apply_transaction_balances_on_update();

CREATE OR REPLACE FUNCTION public.apply_withdrawal_status_balance_delta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  diff_acc numeric(18, 4);
  diff_pm numeric(18, 4);
  amt numeric(18, 4);
  acc record;
  pm record;
BEGIN
  IF NEW.type IS DISTINCT FROM 'withdrawal'::public.transaction_kind THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  amt := NEW.amount;

  diff_acc :=
    (CASE WHEN NEW.status = 'completed'::public.transaction_status THEN -amt ELSE 0 END)
    - (CASE WHEN OLD.status = 'completed'::public.transaction_status THEN -amt ELSE 0 END);

  diff_pm :=
    (CASE WHEN NEW.status = 'completed'::public.transaction_status THEN amt ELSE 0 END)
    - (CASE WHEN OLD.status = 'completed'::public.transaction_status THEN amt ELSE 0 END);

  IF diff_acc = 0 AND diff_pm = 0 THEN
    RETURN NEW;
  END IF;

  SELECT id, current_balance
  INTO acc
  FROM public.gaming_accounts
  WHERE id = NEW.gaming_account_id
  FOR UPDATE;

  SELECT id, balance
  INTO pm
  FROM public.payment_methods
  WHERE id = NEW.payment_method_id
  FOR UPDATE;

  IF acc.id IS NULL OR pm.id IS NULL THEN
    RAISE EXCEPTION 'Conto o metodo non trovato';
  END IF;

  IF pm.player_id IS DISTINCT FROM (
    SELECT player_id FROM public.gaming_accounts WHERE id = NEW.gaming_account_id
  ) THEN
    RAISE EXCEPTION 'Metodo non compatibile con il conto';
  END IF;

  IF acc.current_balance + diff_acc < 0 THEN
    RAISE EXCEPTION 'Saldo conto gioco insufficiente';
  END IF;

  IF pm.balance + diff_pm < 0 THEN
    RAISE EXCEPTION 'Saldo metodo insufficiente';
  END IF;

  UPDATE public.gaming_accounts
  SET current_balance = current_balance + diff_acc
  WHERE id = acc.id;

  UPDATE public.payment_methods
  SET balance = balance + diff_pm
  WHERE id = pm.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_withdrawal_status_balance_delta
  AFTER UPDATE OF status ON public.transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.type = 'withdrawal'::public.transaction_kind)
  EXECUTE PROCEDURE public.apply_withdrawal_status_balance_delta();

COMMENT ON FUNCTION public.apply_withdrawal_status_balance_delta() IS
  'Dopo UPDATE status su prelievo: delta saldi = effetto(new) − effetto(old); solo completed conta.';

-- RLS: prelievo aggiornabile da qualsiasi stato (solo colonna status da client).
DROP POLICY IF EXISTS transactions_update_pending_withdrawal ON public.transactions;
DROP POLICY IF EXISTS transactions_update_withdrawal_status ON public.transactions;

CREATE POLICY transactions_update_withdrawal_status ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND type = 'withdrawal'::public.transaction_kind
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND type = 'withdrawal'::public.transaction_kind
    AND status IN (
      'pending'::public.transaction_status,
      'completed'::public.transaction_status,
      'rejected'::public.transaction_status,
      'cancelled'::public.transaction_status
    )
  );

COMMENT ON COLUMN public.transactions.status IS
  'Stato prelievo/deposito. Prelievo: cambio stato ricalcola saldi (solo completed attivo).';
