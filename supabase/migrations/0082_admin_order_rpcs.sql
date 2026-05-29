-- Migration 0082: admin order RPCs + orders.created_by_admin + storage write policies.
--
-- Four RPCs powering the admin Live Jobs section. Every RPC is SECURITY
-- DEFINER and gated by `is_super_admin()`; every write logs to
-- admin_order_audit (0081). The bound is the same as
-- decline_order / transition_order_status — admin acts via these RPCs only,
-- the row-level WITH CHECK does not need to know about the admin.

BEGIN;

-- ── 0. orders.created_by_admin ──────────────────────────────────────────────
-- Tags orders inserted via admin_create_order_for_consumer so reporting and
-- support can distinguish admin-created jobs from genuine consumer bookings.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_by_admin uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_orders_created_by_admin
  ON public.orders (created_by_admin) WHERE created_by_admin IS NOT NULL;

-- ── 1. admin_reassign_washer ────────────────────────────────────────────────
-- Validates new washer (role=washer, verification approved, no active job),
-- recomputes payout based on new washer's tier (ADR-026), audits the change.

CREATE OR REPLACE FUNCTION public.admin_reassign_washer(
  p_order_id       uuid,
  p_new_washer_id  uuid,
  p_reason         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin         uuid := auth.uid();
  v_order         public.orders%ROWTYPE;
  v_new_washer    public.profiles%ROWTYPE;
  v_old_washer_id uuid;
  v_old_payout    numeric;
  v_new_tier      int;
  v_new_payout    numeric;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'super_admin required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'cannot reassign terminal order (status=%)', v_order.status;
  END IF;

  SELECT * INTO v_new_washer FROM public.profiles WHERE id = p_new_washer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'new_washer_not_found'; END IF;
  IF v_new_washer.role <> 'washer' THEN
    RAISE EXCEPTION 'target user is not a washer (role=%)', v_new_washer.role;
  END IF;
  IF COALESCE(v_new_washer.washer_verification_status, '') <> 'approved' THEN
    RAISE EXCEPTION 'target washer not approved (status=%)',
      COALESCE(v_new_washer.washer_verification_status, 'null');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders
     WHERE washer_id = p_new_washer_id
       AND status IN ('accepted','en_route','arrived','in_progress','pending_approval')
       AND id <> p_order_id
  ) THEN
    RAISE EXCEPTION 'target washer has an active or pending-approval job';
  END IF;

  v_old_washer_id := v_order.washer_id;
  v_old_payout    := v_order.payout_amount;

  -- Recompute payout from new washer's tier (ADR-026).
  v_new_tier := v_new_washer.current_tier;
  IF v_new_tier IS NULL THEN
    -- Unrated washer → default 50 (matches src/lib/payout.js unrated default).
    v_new_payout := 50;
  ELSE
    v_new_payout := public.payout_for_tier(v_new_tier);
  END IF;

  UPDATE public.orders
     SET washer_id     = p_new_washer_id,
         payout_amount = v_new_payout,
         accepted_at   = COALESCE(accepted_at, now()),
         status        = CASE WHEN status = 'pending' THEN 'accepted' ELSE status END
   WHERE id = p_order_id;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (p_order_id, v_order.status, v_order.status, v_admin);

  INSERT INTO public.admin_order_audit (order_id, admin_id, action, reason, payload)
  VALUES (
    p_order_id, v_admin, 'reassign_washer', trim(p_reason),
    jsonb_build_object(
      'old_washer_id', v_old_washer_id,
      'new_washer_id', p_new_washer_id,
      'old_payout',    v_old_payout,
      'new_payout',    v_new_payout,
      'new_tier',      v_new_tier
    )
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_reassign_washer(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reassign_washer(uuid, uuid, text) TO authenticated;

-- ── 2. admin_override_order_price ───────────────────────────────────────────
-- Bypasses validate_order_prices trigger by ALTER TABLE … DISABLE TRIGGER…
-- inside the function via SET LOCAL session_replication_role = 'replica',
-- which suppresses normal triggers for the current session only.

CREATE OR REPLACE FUNCTION public.admin_override_order_price(
  p_order_id           uuid,
  p_new_consumer_price numeric,
  p_new_payout         numeric,
  p_reason             text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin       uuid := auth.uid();
  v_order       public.orders%ROWTYPE;
  v_old_consumer numeric;
  v_old_payout   numeric;
  v_old_base     numeric;
  v_old_fee      numeric;
  v_new_fee      numeric;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'super_admin required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  IF p_new_consumer_price < 0 OR p_new_payout < 0 THEN
    RAISE EXCEPTION 'prices_must_be_non_negative';
  END IF;
  IF p_new_payout > p_new_consumer_price THEN
    RAISE EXCEPTION 'payout cannot exceed consumer price';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  v_old_consumer := v_order.total_price;
  v_old_payout   := v_order.payout_amount;
  v_old_base     := v_order.base_price;
  v_old_fee      := v_order.platform_fee;
  v_new_fee      := p_new_consumer_price - p_new_payout;

  -- session_replication_role='replica' tells PG to skip user-defined triggers
  -- for the rest of this transaction. The validate_order_prices BEFORE
  -- trigger would otherwise overwrite our values.
  SET LOCAL session_replication_role = 'replica';

  UPDATE public.orders
     SET base_price    = p_new_payout,
         platform_fee  = v_new_fee,
         total_price   = p_new_consumer_price,
         payout_amount = p_new_payout
   WHERE id = p_order_id;

  INSERT INTO public.admin_order_audit (order_id, admin_id, action, reason, payload)
  VALUES (
    p_order_id, v_admin, 'override_price', trim(p_reason),
    jsonb_build_object(
      'old_consumer_price', v_old_consumer,
      'new_consumer_price', p_new_consumer_price,
      'old_payout',         v_old_payout,
      'new_payout',         p_new_payout,
      'old_base_price',     v_old_base,
      'old_platform_fee',   v_old_fee,
      'new_platform_fee',   v_new_fee
    )
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_override_order_price(uuid, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_override_order_price(uuid, numeric, numeric, text) TO authenticated;

-- ── 3. admin_create_order_for_consumer ──────────────────────────────────────
-- Inserts a pending order on behalf of a consumer. The validate_order_prices
-- trigger still fires (we WANT canonical pricing here, not an override).

CREATE OR REPLACE FUNCTION public.admin_create_order_for_consumer(
  p_consumer_id   uuid,
  p_lat           double precision,
  p_lng           double precision,
  p_category      text,
  p_car_details   jsonb DEFAULT '{}'::jsonb,
  p_site_flags    jsonb DEFAULT '{}'::jsonb,
  p_access_notes  text  DEFAULT NULL,
  p_skip_payment  boolean DEFAULT false  -- reserved; no payment integration yet
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin       uuid := auth.uid();
  v_consumer    public.profiles%ROWTYPE;
  v_order_id    uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'super_admin required';
  END IF;

  SELECT * INTO v_consumer FROM public.profiles WHERE id = p_consumer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'consumer_not_found'; END IF;
  IF v_consumer.role <> 'consumer' THEN
    RAISE EXCEPTION 'target user is not a consumer (role=%)', v_consumer.role;
  END IF;

  IF p_category NOT IN ('private','jeep','pickup') THEN
    RAISE EXCEPTION 'invalid category: %', p_category;
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'lat/lng required';
  END IF;

  INSERT INTO public.orders (
    consumer_id, car_type, service_type, location,
    base_price, platform_fee, total_price,
    car_plate, car_make, car_model, car_color, car_year,
    site_has_water, site_has_power, access_notes,
    created_by_admin, status
  )
  VALUES (
    p_consumer_id,
    p_category,
    'wash',
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    0, 0, 0,  -- overwritten by validate_order_prices trigger
    NULLIF(p_car_details->>'plate', ''),
    NULLIF(p_car_details->>'make',  ''),
    NULLIF(p_car_details->>'model', ''),
    NULLIF(p_car_details->>'color', ''),
    NULLIF(p_car_details->>'year',  '')::int,
    COALESCE((p_site_flags->>'water')::boolean, false),
    COALESCE((p_site_flags->>'power')::boolean, false),
    p_access_notes,
    v_admin,
    'pending'
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.admin_order_audit (order_id, admin_id, action, reason, payload)
  VALUES (
    v_order_id, v_admin, 'admin_create_order', NULL,
    jsonb_build_object(
      'consumer_id', p_consumer_id,
      'category',    p_category,
      'lat',         p_lat,
      'lng',         p_lng,
      'site_flags',  p_site_flags
    )
  );

  RETURN v_order_id;
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_create_order_for_consumer(uuid, double precision, double precision, text, jsonb, jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_order_for_consumer(uuid, double precision, double precision, text, jsonb, jsonb, text, boolean) TO authenticated;

-- ── 4. admin_log_photo_replacement ──────────────────────────────────────────
-- Photo replacement happens via storage REST + a follow-up UPDATE to the
-- column path. This RPC records the audit row + updates the path. The actual
-- storage object overwrite is handled by the admin client (it must upload via
-- the same path; storage.objects RLS lets super_admin write via the new
-- agent_write_all_evidence policy below).

CREATE OR REPLACE FUNCTION public.admin_log_photo_replacement(
  p_order_id  uuid,
  p_field     text,
  p_new_path  text,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin    uuid := auth.uid();
  v_order    public.orders%ROWTYPE;
  v_old_path text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'super_admin required';
  END IF;
  IF p_field NOT IN (
    'car_photo_front','car_photo_back','car_photo_driver','car_photo_passenger',
    'arrival_photo_front','arrival_photo_back','arrival_photo_driver','arrival_photo_passenger',
    'completion_photo_front','completion_photo_back','completion_photo_driver','completion_photo_passenger'
  ) THEN
    RAISE EXCEPTION 'invalid photo field: %', p_field;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  EXECUTE format('SELECT $1.%I', p_field) INTO v_old_path USING v_order;

  EXECUTE format('UPDATE public.orders SET %I = $1 WHERE id = $2', p_field)
    USING p_new_path, p_order_id;

  INSERT INTO public.admin_order_audit (order_id, admin_id, action, reason, payload)
  VALUES (
    p_order_id, v_admin, 'replace_photo', NULLIF(trim(COALESCE(p_reason, '')), ''),
    jsonb_build_object('field', p_field, 'old_path', v_old_path, 'new_path', p_new_path)
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_log_photo_replacement(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_log_photo_replacement(uuid, text, text, text) TO authenticated;

-- ── 5. Storage policies — super_admin write on car-photos + job-evidence ───
-- Mirrors the `agent_read_all_verification` pattern from 0068 but for write.
-- Idempotent: drop first so a re-run does not error.

DROP POLICY IF EXISTS "super_admin_write_car_photos" ON storage.objects;
CREATE POLICY "super_admin_write_car_photos"
  ON storage.objects FOR ALL TO authenticated
  USING       (bucket_id = 'car-photos'   AND public.is_super_admin())
  WITH CHECK  (bucket_id = 'car-photos'   AND public.is_super_admin());

DROP POLICY IF EXISTS "super_admin_write_job_evidence" ON storage.objects;
CREATE POLICY "super_admin_write_job_evidence"
  ON storage.objects FOR ALL TO authenticated
  USING       (bucket_id = 'job-evidence' AND public.is_super_admin())
  WITH CHECK  (bucket_id = 'job-evidence' AND public.is_super_admin());

-- super_admin also needs to read car-photos in admin UI; agents already
-- have read access to job-evidence and washer-verification per 0035/0068.
DROP POLICY IF EXISTS "super_admin_read_car_photos" ON storage.objects;
CREATE POLICY "super_admin_read_car_photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'car-photos' AND public.is_super_admin());

DROP POLICY IF EXISTS "super_admin_read_job_evidence" ON storage.objects;
CREATE POLICY "super_admin_read_job_evidence"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'job-evidence' AND public.is_super_admin());

COMMIT;
