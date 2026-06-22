-- Migration 0130: an order only enters the washer pool AFTER payment is accepted.
--
-- ADR-042/043 follow-through. Orders are created as status='pending' on the
-- booking tap, BEFORE the consumer reaches the checkout page (a scaffold
-- simplification). Until now nothing checked payment, so an UNPAID order was
-- visible to washers the instant it was inserted — it showed up in nearby_jobs,
-- was readable via the washer RLS, and fired the "new job nearby" push. The
-- order must NOT be offered to washers until it is paid.
--
-- orders.paid_at (migration 0128) is the payment gate — it is set ONLY
-- server-side by a verified charge (charge-saved-card today; the new-card
-- clearing callback later). This migration enforces that gate on every
-- washer-visibility surface, and moves the fan-out push from "order created" to
-- "order paid":
--
--   1. nearby_jobs RPC            → AND o.paid_at IS NOT NULL   (13-col shape kept)
--   2. "orders: washer read pending" RLS → AND paid_at IS NOT NULL
--   3. "orders: washer update assigned" RLS → the accept branch requires paid_at
--   4. fan-out push: drop the AFTER INSERT trigger; fire AFTER paid_at is set
--
-- It also adds confirm_scaffold_payment() — a guarded RPC the checkout page calls
-- in SCAFFOLD mode (no real terminal yet) so a "Pay" tap marks the order paid the
-- same way a real charge would, keeping the end-to-end flow testable. It REFUSES
-- once payments go live (app_config.payments_live = true), so it can never be a
-- "skip payment" bypass with real money — the verified clearing callback becomes
-- the only path that sets paid_at.
--
-- DROP-before-CREATE per migration discipline. No inner BEGIN/COMMIT — the runner
-- wraps each file in one transaction.

-- ── 1. nearby_jobs — paid orders only (verbatim 13-col copy of 0097 + paid gate)
-- The RETURNS TABLE shape is unchanged (contract: lat/lng for WorkerMap pins),
-- so the only behavioural change is the new `o.paid_at IS NOT NULL` predicate.
DROP FUNCTION IF EXISTS public.nearby_jobs(double precision, double precision, integer);

CREATE OR REPLACE FUNCTION public.nearby_jobs(
  washer_lat float,
  washer_lng float,
  radius_km  int default 15
)
RETURNS TABLE (
  id              uuid,
  consumer_id     uuid,
  car_type        text,
  service_type    text,
  address_label   text,
  base_price      numeric,
  platform_fee    numeric,
  total_price     numeric,
  status          text,
  created_at      timestamptz,
  distance_km     float,
  lat             float,
  lng             float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    o.id,
    o.consumer_id,
    o.car_type,
    o.service_type,
    o.address_label,
    o.base_price,
    o.platform_fee,
    o.total_price,
    o.status,
    o.created_at,
    round(
      (ST_Distance(
        o.location::geography,
        ST_SetSRID(ST_MakePoint(washer_lng, washer_lat), 4326)::geography
      ) / 1000.0)::numeric,
      2
    )::float                          as distance_km,
    ST_Y(o.location::geometry)::float as lat,
    ST_X(o.location::geometry)::float as lng
  FROM public.orders o
  WHERE
    o.status = 'pending'
    AND o.paid_at IS NOT NULL          -- 0130: unpaid orders never enter the pool
    AND ST_DWithin(
      o.location::geography,
      ST_SetSRID(ST_MakePoint(washer_lng, washer_lat), 4326)::geography,
      radius_km * 1000.0
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'washer' AND is_online = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.orders o2
       WHERE o2.washer_id = auth.uid()
         AND o2.status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
    )
  ORDER BY distance_km ASC;
$$;

GRANT EXECUTE ON FUNCTION public.nearby_jobs(float, float, int) TO authenticated;

-- ── 2. Washer read RLS — a washer can only SEE a pending order once it's paid ──
-- Mirrors 0002's "orders: washer read pending" verbatim + the paid_at predicate.
-- This also governs Realtime: Supabase honors RLS, so an unpaid INSERT is withheld
-- from washer channels and the order only streams in once paid_at is set.
DROP POLICY IF EXISTS "orders: washer read pending" ON public.orders;
CREATE POLICY "orders: washer read pending"
  ON public.orders FOR SELECT
  USING (
    status = 'pending'
    AND paid_at IS NOT NULL
    AND exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'washer' and is_online = true
    )
  );

-- ── 3. Washer update RLS — accept branch requires a paid order ────────────────
-- Defense in depth: even if a washer learned an unpaid order id, the accept
-- branch (status='pending' AND washer_id IS NULL) now also requires paid_at.
-- The assigned-washer branch + the 0098 WITH CHECK are reproduced verbatim.
DROP POLICY IF EXISTS "orders: washer update assigned" ON public.orders;
CREATE POLICY "orders: washer update assigned"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    washer_id = auth.uid()
    OR (status = 'pending' AND washer_id IS NULL AND paid_at IS NOT NULL)
  )
  WITH CHECK (
    washer_id = auth.uid()
    AND status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
  );

-- ── 4. Fan-out push fires on PAID, not on INSERT ──────────────────────────────
-- The 0053 AFTER INSERT trigger pushed "new job nearby" the moment the (unpaid)
-- order was created. Drop it and notify when the order becomes paid instead.
-- notify_on_order_repend (0127, washer release → pending) is unchanged: a released
-- order keeps its paid_at, so re-offering still works.
DROP TRIGGER IF EXISTS trg_notify_on_new_order ON public.orders;

CREATE OR REPLACE FUNCTION public.notify_on_order_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  -- Only fan-out the first time an order becomes paid while still pending.
  IF NEW.paid_at IS NULL OR NEW.status <> 'pending' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'fan_out_nearby_job_url' LIMIT 1;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'notify_on_order_paid: Vault secrets fan_out_nearby_job_url or service_role_key not found — skipping';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('order_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- pg_net failure must never abort the payment UPDATE.
  RAISE WARNING 'notify_on_order_paid: net.http_post failed (non-blocking): %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_order_paid ON public.orders;
CREATE TRIGGER trg_notify_on_order_paid
  AFTER UPDATE OF paid_at ON public.orders
  FOR EACH ROW
  WHEN (OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL AND NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_on_order_paid();

-- ── 5. Boolean config helper (mirrors get_config_number / get_config_text) ─────
CREATE OR REPLACE FUNCTION public.get_config_bool(p_key text, p_default boolean)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT (value->>'value')::boolean
       FROM public.app_config
      WHERE key = p_key
        AND value_type = 'boolean'),
    p_default
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_config_bool(text, boolean) TO authenticated, anon;

-- payments_live = false → the app is still in scaffold mode (no live terminal).
-- A super_admin flips this to true (admin Config) when the real clearing charge
-- is wired; confirm_scaffold_payment() then refuses, so the only thing that can
-- set paid_at is the verified server-side charge.
INSERT INTO public.app_config (key, value, value_type) VALUES
  ('payments_live', '{"value": false}'::jsonb, 'boolean')
ON CONFLICT (key) DO NOTHING;

-- ── 6. Scaffold payment confirm — marks the caller's own pending order paid ────
-- Used by the checkout "Pay" button while there is no live terminal, so the order
-- enters the washer pool exactly as a real payment would (and the paid fan-out
-- fires). Guarded three ways: the caller must OWN the order, the order must be
-- pending + unpaid, and payments must NOT be live. Once payments_live = true this
-- RPC raises — a real charge (charge-saved-card / the clearing callback) is then
-- the only path that sets paid_at, so this can never become a free-wash bypass.
DROP FUNCTION IF EXISTS public.confirm_scaffold_payment(uuid);
CREATE FUNCTION public.confirm_scaffold_payment(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF public.get_config_bool('payments_live', false) THEN
    RAISE EXCEPTION 'payments are live — paid_at is set only by a verified charge';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.consumer_id <> auth.uid() THEN RAISE EXCEPTION 'not your order'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'order not payable'; END IF;
  IF v_order.paid_at IS NOT NULL THEN RETURN; END IF;  -- already paid → no-op

  UPDATE public.orders
     SET paid_at = now(), payment_ref = 'scaffold'
   WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_scaffold_payment(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_scaffold_payment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
