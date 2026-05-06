-- Aggiornamento saldi su UPDATE di bets: gestito dall'app (read + write espliciti).
-- Evita doppio conteggio con logica client su profit/status.
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

-- Client: aggiustamento manuale saldi dopo cambio stato / modifica scommessa
GRANT UPDATE (current_balance) ON public.gaming_accounts TO authenticated;
GRANT UPDATE (balance) ON public.players TO authenticated;
