-- Saldo prelievo su cambio stato: gestito dal client (sequenza update).
-- Evita doppio movimento e conflitti con trigger.

DROP TRIGGER IF EXISTS transactions_withdrawal_status_balance_delta ON public.transactions;
DROP FUNCTION IF EXISTS public.apply_withdrawal_status_balance_delta();
