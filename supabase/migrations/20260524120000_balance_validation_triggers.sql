-- Messaggi coerenti su depositi / prelievi e vincoli saldo ≥ 0.
-- Validazione stake scommessa vs saldo conto (BEFORE INSERT/UPDATE).

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
      RAISE EXCEPTION 'Saldo metodo insufficiente';
    END IF;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance + NEW.amount
    WHERE id = acc.id;

    UPDATE public.payment_methods
    SET balance = balance - NEW.amount
    WHERE id = pm.id;

    IF (SELECT current_balance FROM public.gaming_accounts WHERE id = acc.id) < 0 THEN
      RAISE EXCEPTION 'Saldo conto non valido dopo il deposito';
    END IF;
    IF (SELECT balance FROM public.payment_methods WHERE id = pm.id) < 0 THEN
      RAISE EXCEPTION 'Saldo metodo non valido dopo il deposito';
    END IF;
  ELSIF NEW.type = 'withdrawal'::public.transaction_kind THEN
    IF acc.current_balance < NEW.amount THEN
      RAISE EXCEPTION 'Saldo conto insufficiente per completare il prelievo';
    END IF;
    UPDATE public.gaming_accounts
    SET current_balance = current_balance - NEW.amount
    WHERE id = acc.id;

    UPDATE public.payment_methods
    SET balance = balance + NEW.amount
    WHERE id = pm.id;

    IF (SELECT current_balance FROM public.gaming_accounts WHERE id = acc.id) < 0 THEN
      RAISE EXCEPTION 'Saldo conto non valido dopo il prelievo';
    END IF;
    IF (SELECT balance FROM public.payment_methods WHERE id = pm.id) < 0 THEN
      RAISE EXCEPTION 'Saldo metodo non valido dopo il prelievo';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo transazione non gestito: %', NEW.type;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- vincoli saldo ≥ 0 (idempotenti)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  ALTER TABLE public.payment_methods
    ADD CONSTRAINT payment_methods_balance_nonneg CHECK (balance >= 0);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.stakers
    ADD CONSTRAINT stakers_balance_nonneg CHECK (balance >= 0);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- Scommesse: stake non superi il saldo conto (stato open/void/cashout/lost/won)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bets_validate_stake_vs_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bal numeric(18, 4);
BEGIN
  -- Modifiche a giocate esistenti: saldi gestiti dal client (delta referto).
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.stake IS NULL OR NEW.stake <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT current_balance
  INTO bal
  FROM public.gaming_accounts
  WHERE id = NEW.gaming_account_id
  FOR UPDATE;

  IF bal IS NULL THEN
    RAISE EXCEPTION 'Conto gioco non trovato';
  END IF;

  IF bal < NEW.stake THEN
    RAISE EXCEPTION 'Saldo conto insufficiente';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bets_validate_stake_vs_balance_trigger ON public.bets;

CREATE TRIGGER bets_validate_stake_vs_balance_trigger
  BEFORE INSERT ON public.bets
  FOR EACH ROW
  EXECUTE PROCEDURE public.bets_validate_stake_vs_balance();

COMMENT ON FUNCTION public.bets_validate_stake_vs_balance() IS
  'INSERT: stake non superiore al current_balance del conto (FOR UPDATE). UPDATE: nessun controllo (client).';
