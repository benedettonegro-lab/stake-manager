-- method_name obbligatorio; label opzionale (nuovi insert: type + method_name + balance, senza label).

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS method_name text;

UPDATE public.payment_methods
SET method_name = trim(
  both
  from
    coalesce(
      nullif(trim(method_name), ''),
      CASE
        WHEN position(' · ' in coalesce(label, '')) > 0 THEN
          substring(label from position(' · ' in label) + char_length(' · '))
        ELSE coalesce(label, '')
      END
    )
);

UPDATE public.payment_methods
SET method_name = '—'
WHERE trim(coalesce(method_name, '')) = '';

ALTER TABLE public.payment_methods
  ALTER COLUMN method_name SET NOT NULL;

ALTER TABLE public.payment_methods
  ALTER COLUMN label DROP NOT NULL;

REVOKE UPDATE ON public.payment_methods FROM authenticated;
GRANT UPDATE (label, method_name, balance, "type", note, player_id, identity_id)
  ON public.payment_methods TO authenticated;
