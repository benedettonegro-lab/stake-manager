-- Aggiornamento saldi su UPDATE scommessa: delta = NEW.profit - OLD.profit
-- (storna effetto precedente e applica il nuovo, coerente con getProfit per ogni stato)
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
    IF OLD.gaming_account_id IS NOT DISTINCT FROM NEW.gaming_account_id
      AND OLD.player_id IS NOT DISTINCT FROM NEW.player_id THEN
      UPDATE public.gaming_accounts
      SET current_balance = current_balance + (NEW.profit - OLD.profit)
      WHERE id = NEW.gaming_account_id;
      UPDATE public.players
      SET balance = balance + (NEW.profit - OLD.profit)
      WHERE id = NEW.player_id;
    ELSE
      old_eff := CASE
        WHEN OLD.status IN ('won'::public.bet_status, 'lost'::public.bet_status) THEN OLD.profit
        ELSE 0
      END;
      new_eff := CASE
        WHEN NEW.status IN ('won'::public.bet_status, 'lost'::public.bet_status) THEN NEW.profit
        ELSE 0
      END;
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
