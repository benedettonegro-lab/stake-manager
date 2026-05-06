-- Base per ricalcolo saldo metodo da ledger (initial + prelievi completed − depositi completed).
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS initial_balance numeric(18, 4) NOT NULL DEFAULT 0;

-- initial_balance tale che: balance = initial + W_completed − D_completed
UPDATE public.payment_methods pm
SET initial_balance = GREATEST(
  0::numeric(18, 4),
  COALESCE(pm.balance, 0)
    - COALESCE(
        (
          SELECT SUM(t.amount)::numeric(18, 4)
          FROM public.transactions t
          WHERE t.payment_method_id = pm.id
            AND t.status = 'completed'::public.transaction_status
            AND t.type = 'withdrawal'::public.transaction_kind
        ),
        0
      )
    + COALESCE(
        (
          SELECT SUM(t.amount)::numeric(18, 4)
          FROM public.transactions t
          WHERE t.payment_method_id = pm.id
            AND t.status = 'completed'::public.transaction_status
            AND t.type = 'deposit'::public.transaction_kind
        ),
        0
      )
);

REVOKE UPDATE ON public.payment_methods FROM authenticated;

GRANT UPDATE (
  label,
  method_name,
  balance,
  "type",
  note,
  player_id,
  identity_id,
  initial_balance
)
  ON public.payment_methods TO authenticated;

COMMENT ON COLUMN public.payment_methods.initial_balance IS
  'Saldo metodo prima dei movimenti registrati; balance = initial_balance + prelievi completed − depositi completed.';
