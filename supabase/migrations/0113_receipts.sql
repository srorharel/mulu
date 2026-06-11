-- 0113_receipts.sql — ADR-041: customer receipts on order approval.
--
-- When an order reaches 'completed' (agent approval or admin force-complete),
-- a receipt row is issued — sequential receipt_number, full snapshot of both
-- the financials and the business details — and ONE net.http_post fires the
-- send-receipt Edge Function, which emails the customer the receipt together
-- with the wash confirmation (Resend API). Mirrors the 0108 fan-out pattern:
-- vault URL lookup, exception-safe (a receipt/email failure never aborts the
-- order transition).
--
-- Business details (authorized-dealer / עוסק מורשה number, sender email,
-- footer, VAT rate…) live in app_config and are edited in the admin app's
-- Receipts tab. They are SNAPSHOTTED onto each receipt at issue time so an
-- admin edit never rewrites historical receipts.
--
-- Prerequisites (run once after deployment — environment-specific, NOT here):
--   • Vault secret 'send_receipt_url' =
--       'https://<project-ref>.supabase.co/functions/v1/send-receipt'
--     ('service_role_key' already exists for the other fan-outs.)
--   • Edge Function secrets: TRIGGER_SECRET (= service role key, same as the
--     other fan-outs) + RESEND_API_KEY.
--   Until the Vault secret exists the trigger issues the receipt row and logs
--   a warning instead of emailing (admin can resend later).

-- ── 1. Sequential numbering + receipts table ─────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.receipts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number   bigint NOT NULL UNIQUE DEFAULT nextval('public.receipt_number_seq'),
  order_id         uuid NOT NULL UNIQUE REFERENCES public.orders(id),
  consumer_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- consumer snapshot (nulled by delete-account, like order PII)
  consumer_name    text,
  consumer_email   text,
  -- order snapshot
  car_type         text,
  total            numeric(10, 2) NOT NULL,
  discount_amount  numeric(10, 2) NOT NULL DEFAULT 0,
  vat_rate_percent numeric(5, 2)  NOT NULL,
  pre_vat          numeric(10, 2) NOT NULL,
  vat_amount       numeric(10, 2) NOT NULL,
  -- business snapshot (app_config values at issue time)
  business_name    text,
  dealer_number    text,
  business_address text,
  business_phone   text,
  sender_email     text,
  sender_name      text,
  footer_text      text,
  -- delivery
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_detail     text,
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

-- Consumers see their own receipts.
DROP POLICY IF EXISTS "receipts consumer own read" ON public.receipts;
CREATE POLICY "receipts consumer own read"
  ON public.receipts FOR SELECT
  USING (consumer_id = auth.uid());

-- Explicit super_admin SELECT (admin Receipts tab reads via PostgREST — a
-- missing policy is a silently empty list, see the 0090 lesson).
DROP POLICY IF EXISTS "receipts super_admin read" ON public.receipts;
CREATE POLICY "receipts super_admin read"
  ON public.receipts FOR SELECT
  USING (public.is_super_admin());

-- No client INSERT/UPDATE policies: rows are written by the SECURITY DEFINER
-- trigger below and by the service-role Edge Function (both bypass RLS).

-- Realtime so the admin Receipts tab sees new receipts / status flips live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;
  END IF;
END $$;

-- ── 2. Configurable receipt fields (admin-editable app_config rows) ──────────

INSERT INTO public.app_config (key, value, value_type) VALUES
  ('receipts_enabled',         jsonb_build_object('value', 'true'), 'string'),
  ('receipt_business_name',    jsonb_build_object('value', 'MULU'), 'string'),
  ('receipt_dealer_number',    jsonb_build_object('value', ''),     'string'),
  ('receipt_business_address', jsonb_build_object('value', ''),     'string'),
  ('receipt_business_phone',   jsonb_build_object('value', ''),     'string'),
  ('receipt_sender_email',     jsonb_build_object('value', ''),     'string'),
  ('receipt_sender_name',      jsonb_build_object('value', 'MULU'), 'string'),
  ('receipt_footer_text',      jsonb_build_object('value', ''),     'string'),
  ('receipt_vat_rate_percent', jsonb_build_object('value', 18),     'number')
ON CONFLICT (key) DO NOTHING;

-- ── 3. Issue trigger — receipt row + ONE net.http_post to send-receipt ───────

CREATE OR REPLACE FUNCTION public.issue_receipt_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, extensions, pg_temp
AS $$
DECLARE
  v_email      text;
  v_name       text;
  v_vat_rate   numeric;
  v_pre_vat    numeric(10, 2);
  v_receipt_id uuid;
  v_url        text;
  v_key        text;
BEGIN
  -- Anonymized / admin-created-without-consumer orders get no receipt.
  IF NEW.consumer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_config_text('receipts_enabled', 'true') <> 'true' THEN
    RETURN NEW;
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = NEW.consumer_id;
  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id = NEW.consumer_id;

  v_vat_rate := public.get_config_number('receipt_vat_rate_percent', 18);
  v_pre_vat  := ROUND((NEW.total_price / (1 + v_vat_rate / 100.0))::numeric, 2);

  -- UNIQUE(order_id) + DO NOTHING = idempotent against double transitions.
  INSERT INTO public.receipts (
    order_id, consumer_id, consumer_name, consumer_email,
    car_type, total, discount_amount, vat_rate_percent, pre_vat, vat_amount,
    business_name, dealer_number, business_address, business_phone,
    sender_email, sender_name, footer_text
  ) VALUES (
    NEW.id, NEW.consumer_id, v_name, v_email,
    NEW.car_type, NEW.total_price, COALESCE(NEW.discount_amount, 0),
    v_vat_rate, v_pre_vat, NEW.total_price - v_pre_vat,
    public.get_config_text('receipt_business_name',    'MULU'),
    public.get_config_text('receipt_dealer_number',    ''),
    public.get_config_text('receipt_business_address', ''),
    public.get_config_text('receipt_business_phone',   ''),
    public.get_config_text('receipt_sender_email',     ''),
    public.get_config_text('receipt_sender_name',      'MULU'),
    public.get_config_text('receipt_footer_text',      '')
  )
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_receipt_id;

  IF v_receipt_id IS NULL THEN
    RETURN NEW;  -- receipt already issued for this order
  END IF;

  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'send_receipt_url' LIMIT 1;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'issue_receipt_on_completion: vault secrets send_receipt_url or service_role_key not found — receipt % issued but not emailed', v_receipt_id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('receipt_id', v_receipt_id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A receipt/email failure must never abort the order transition.
  RAISE WARNING 'issue_receipt_on_completion: failed (non-blocking): %', sqlerrm;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issue_receipt_on_completion ON public.orders;
CREATE TRIGGER trg_issue_receipt_on_completion
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.issue_receipt_on_completion();

-- ── 4. Admin resend — re-fires the Edge Function without exposing secrets ────

CREATE OR REPLACE FUNCTION public.admin_resend_receipt(p_receipt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, extensions, pg_temp
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_super_admin';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.receipts WHERE id = p_receipt_id) THEN
    RAISE EXCEPTION 'receipt_not_found';
  END IF;

  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'send_receipt_url' LIMIT 1;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'vault_secrets_missing';
  END IF;

  UPDATE public.receipts
  SET status = 'pending', error_detail = NULL
  WHERE id = p_receipt_id;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('receipt_id', p_receipt_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resend_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resend_receipt(uuid) TO authenticated;
