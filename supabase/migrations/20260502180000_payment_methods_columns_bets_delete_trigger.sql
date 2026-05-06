-- Metodi pagamento: campi espliciti per modifica UI + note
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS method_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS method_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS note text;

UPDATE public.payment_methods
SET
  method_type = CASE
    WHEN position(' · ' in label) > 0 THEN
      trim(
        both
        from
          substring(
            label
            from
            1 for greatest(position(' · ' in label) - 1, 0)
          )
      )
    ELSE ''
  END,
  method_name = CASE
    WHEN position(' · ' in label) > 0 THEN
      trim(
        both
        from
          substring(label from position(' · ' in label) + char_length(' · '))
      )
    ELSE trim(both from label)
  END;

UPDATE public.payment_methods
SET method_type = 'Altro', method_name = trim(both from label)
WHERE trim(both from method_name) = '' AND trim(both from label) <> '';

UPDATE public.payment_methods
SET label = trim(method_type) || ' · ' || trim(method_name)
WHERE trim(method_type) <> '' AND trim(method_name) <> '';

-- Client: aggiorna label, saldo e campi metodo
GRANT UPDATE (label, current_balance, method_name, method_type, note)
  ON public.payment_methods TO authenticated;

-- Alla cancellazione scommessa: storna effetto su conti gioco / saldo scommesse player
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
    UPDATE public.players
    SET balance = balance - old_eff
    WHERE id = OLD.player_id;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS bets_apply_settlement_balances_trigger ON public.bets;

CREATE TRIGGER bets_apply_settlement_balances_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.bets
  FOR EACH ROW
  EXECUTE PROCEDURE public.bets_apply_settlement_balances();
