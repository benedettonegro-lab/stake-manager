-- Giocate: stake trattenuto sul conto/staker fin da subito (open/lost = −stake; won = −stake+stake*quota).
-- Referto open→lost: nessun delta; open→won: +stake*quota; modifica stake su aperta: differenza contributi.
-- DELETE su aperta: ripristina ( − contributo = +stake ).
-- Eliminati aggiornamenti saldo lato client per evitare doppi conteggi (solo trigger AFTER).

CREATE OR REPLACE FUNCTION public.bet_balance_contribution(
  p_status public.bet_status,
  p_stake numeric,
  p_odds numeric,
  p_profit numeric
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT (
    CASE p_status
      WHEN 'open'::public.bet_status THEN round(-coalesce(p_stake, 0), 4)
      WHEN 'lost'::public.bet_status THEN round(-coalesce(p_stake, 0), 4)
      WHEN 'won'::public.bet_status THEN
        CASE
          WHEN coalesce(p_odds, 0) > 0 THEN
            round(coalesce(p_stake, 0) * coalesce(p_odds, 0) - coalesce(p_stake, 0), 4)
          ELSE round(-coalesce(p_stake, 0), 4)
        END
      WHEN 'void'::public.bet_status THEN 0::numeric
      WHEN 'cashout'::public.bet_status THEN round(coalesce(p_profit, 0), 4)
      ELSE 0::numeric
    END
  )::numeric;
$fn$;

COMMENT ON FUNCTION public.bet_balance_contribution(public.bet_status, numeric, numeric, numeric) IS
  'Contributo netto della riga bets su gaming_accounts/stakers (coerente con stake trattenuto e vincita lorda).';

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
    new_eff := public.bet_balance_contribution(NEW.status, NEW.stake, NEW.odds, NEW.profit);
    UPDATE public.gaming_accounts
    SET current_balance = current_balance + new_eff
    WHERE id = NEW.gaming_account_id;
    UPDATE public.stakers
    SET balance = balance + new_eff
    WHERE id = NEW.staker_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_eff := public.bet_balance_contribution(OLD.status, OLD.stake, OLD.odds, OLD.profit);
    new_eff := public.bet_balance_contribution(NEW.status, NEW.stake, NEW.odds, NEW.profit);

    IF OLD.gaming_account_id IS NOT DISTINCT FROM NEW.gaming_account_id
      AND OLD.staker_id IS NOT DISTINCT FROM NEW.staker_id THEN
      UPDATE public.gaming_accounts
      SET current_balance = current_balance + (new_eff - old_eff)
      WHERE id = NEW.gaming_account_id;
      UPDATE public.stakers
      SET balance = balance + (new_eff - old_eff)
      WHERE id = NEW.staker_id;
    ELSE
      UPDATE public.gaming_accounts
      SET current_balance = current_balance - old_eff
      WHERE id = OLD.gaming_account_id;
      UPDATE public.stakers
      SET balance = balance - old_eff
      WHERE id = OLD.staker_id;
      UPDATE public.gaming_accounts
      SET current_balance = current_balance + new_eff
      WHERE id = NEW.gaming_account_id;
      UPDATE public.stakers
      SET balance = balance + new_eff
      WHERE id = NEW.staker_id;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    old_eff := public.bet_balance_contribution(OLD.status, OLD.stake, OLD.odds, OLD.profit);
    UPDATE public.gaming_accounts
    SET current_balance = current_balance - old_eff
    WHERE id = OLD.gaming_account_id;
    UPDATE public.stakers
    SET balance = balance - old_eff
    WHERE id = OLD.staker_id;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.bets_validate_stake_vs_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bal_ga numeric(18, 4);
  bal_sk numeric(18, 4);
  old_eff numeric(18, 4);
  new_eff numeric(18, 4);
  old_ga_bal numeric(18, 4);
  new_ga_bal numeric(18, 4);
  old_sk_bal numeric(18, 4);
  new_sk_bal numeric(18, 4);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stake IS NULL OR NEW.stake <= 0 THEN
      RETURN NEW;
    END IF;

    SELECT ga.current_balance INTO bal_ga
    FROM public.gaming_accounts ga
    WHERE ga.id = NEW.gaming_account_id
    FOR UPDATE;

    SELECT sk.balance INTO bal_sk
    FROM public.stakers sk
    WHERE sk.id = NEW.staker_id
    FOR UPDATE;

    IF bal_ga IS NULL OR bal_sk IS NULL THEN
      RAISE EXCEPTION 'Conto gioco o staker non trovato';
    END IF;

    IF bal_ga < NEW.stake THEN
      RAISE EXCEPTION 'Saldo conto insufficiente';
    END IF;

    IF bal_sk < NEW.stake THEN
      RAISE EXCEPTION 'Saldo staker insufficiente';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_eff := public.bet_balance_contribution(OLD.status, OLD.stake, OLD.odds, OLD.profit);
    new_eff := public.bet_balance_contribution(NEW.status, NEW.stake, NEW.odds, NEW.profit);

    IF OLD.gaming_account_id IS NOT DISTINCT FROM NEW.gaming_account_id
      AND OLD.staker_id IS NOT DISTINCT FROM NEW.staker_id THEN
      SELECT ga.current_balance INTO bal_ga
      FROM public.gaming_accounts ga
      WHERE ga.id = NEW.gaming_account_id
      FOR UPDATE;

      SELECT sk.balance INTO bal_sk
      FROM public.stakers sk
      WHERE sk.id = NEW.staker_id
      FOR UPDATE;

      IF bal_ga + (new_eff - old_eff) < -0.0001 THEN
        RAISE EXCEPTION 'Saldo conto insufficiente per questa modifica';
      END IF;
      IF bal_sk + (new_eff - old_eff) < -0.0001 THEN
        RAISE EXCEPTION 'Saldo staker insufficiente per questa modifica';
      END IF;
    ELSE
      IF OLD.gaming_account_id < NEW.gaming_account_id THEN
        PERFORM 1 FROM public.gaming_accounts WHERE id = OLD.gaming_account_id FOR UPDATE;
        PERFORM 1 FROM public.gaming_accounts WHERE id = NEW.gaming_account_id FOR UPDATE;
      ELSE
        PERFORM 1 FROM public.gaming_accounts WHERE id = NEW.gaming_account_id FOR UPDATE;
        PERFORM 1 FROM public.gaming_accounts WHERE id = OLD.gaming_account_id FOR UPDATE;
      END IF;

      IF OLD.staker_id < NEW.staker_id THEN
        PERFORM 1 FROM public.stakers WHERE id = OLD.staker_id FOR UPDATE;
        PERFORM 1 FROM public.stakers WHERE id = NEW.staker_id FOR UPDATE;
      ELSE
        PERFORM 1 FROM public.stakers WHERE id = NEW.staker_id FOR UPDATE;
        PERFORM 1 FROM public.stakers WHERE id = OLD.staker_id FOR UPDATE;
      END IF;

      SELECT current_balance INTO old_ga_bal
      FROM public.gaming_accounts
      WHERE id = OLD.gaming_account_id;

      SELECT balance INTO old_sk_bal
      FROM public.stakers
      WHERE id = OLD.staker_id;

      SELECT current_balance INTO new_ga_bal
      FROM public.gaming_accounts
      WHERE id = NEW.gaming_account_id;

      SELECT balance INTO new_sk_bal
      FROM public.stakers
      WHERE id = NEW.staker_id;

      IF old_ga_bal - old_eff < -0.0001 THEN
        RAISE EXCEPTION 'Saldo conto insufficiente (origine)';
      END IF;
      IF old_sk_bal - old_eff < -0.0001 THEN
        RAISE EXCEPTION 'Saldo staker insufficiente (origine)';
      END IF;
      IF new_ga_bal + new_eff < -0.0001 THEN
        RAISE EXCEPTION 'Saldo conto insufficiente (destinazione)';
      END IF;
      IF new_sk_bal + new_eff < -0.0001 THEN
        RAISE EXCEPTION 'Saldo staker insufficiente (destinazione)';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bets_validate_stake_vs_balance_trigger ON public.bets;

CREATE TRIGGER bets_validate_stake_vs_balance_trigger
  BEFORE INSERT OR UPDATE ON public.bets
  FOR EACH ROW
  EXECUTE PROCEDURE public.bets_validate_stake_vs_balance();

COMMENT ON FUNCTION public.bets_validate_stake_vs_balance() IS
  'INSERT: stake ≤ saldo conto e staker. UPDATE: saldi non negativi dopo delta contributo o cambio conto/staker.';
