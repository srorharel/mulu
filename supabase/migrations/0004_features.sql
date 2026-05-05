-- ─── Schema additions ─────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS key_location               text,
  ADD COLUMN IF NOT EXISTS site_has_water             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS site_has_power             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS addon_wiper_fluid          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS addon_tire_pressure        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_wash_path         text,
  ADD COLUMN IF NOT EXISTS evidence_wiper_fluid_path  text,
  ADD COLUMN IF NOT EXISTS evidence_tire_pressure_path text;

-- ─── validate_order_prices — now includes add-on pricing ─────────────────────
-- Mirrors src/lib/pricing.js exactly.
-- base_price = service table lookup + 20 per selected add-on
-- platform_fee = round(base_price * 0.15, 2)
-- total_price  = base_price + platform_fee

CREATE OR REPLACE FUNCTION public.validate_order_prices()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_base numeric(10, 2);
  v_fee  numeric(10, 2);
BEGIN
  v_base := CASE
    WHEN NEW.car_type = 'sedan'  AND NEW.service_type = 'exterior' THEN  60.00
    WHEN NEW.car_type = 'sedan'  AND NEW.service_type = 'interior' THEN  70.00
    WHEN NEW.car_type = 'sedan'  AND NEW.service_type = 'full'     THEN 110.00
    WHEN NEW.car_type = 'suv'    AND NEW.service_type = 'exterior' THEN  75.00
    WHEN NEW.car_type = 'suv'    AND NEW.service_type = 'interior' THEN  85.00
    WHEN NEW.car_type = 'suv'    AND NEW.service_type = 'full'     THEN 130.00
    WHEN NEW.car_type = 'pickup' AND NEW.service_type = 'exterior' THEN  80.00
    WHEN NEW.car_type = 'pickup' AND NEW.service_type = 'interior' THEN  90.00
    WHEN NEW.car_type = 'pickup' AND NEW.service_type = 'full'     THEN 140.00
    WHEN NEW.car_type = 'van'    AND NEW.service_type = 'exterior' THEN  90.00
    WHEN NEW.car_type = 'van'    AND NEW.service_type = 'interior' THEN 100.00
    WHEN NEW.car_type = 'van'    AND NEW.service_type = 'full'     THEN 160.00
    ELSE NULL
  END;

  IF v_base IS NULL THEN
    RAISE EXCEPTION 'Unknown car_type/service_type combination: %/%',
      NEW.car_type, NEW.service_type;
  END IF;

  v_base := v_base
    + CASE WHEN COALESCE(NEW.addon_wiper_fluid,   false) THEN 20.00 ELSE 0.00 END
    + CASE WHEN COALESCE(NEW.addon_tire_pressure, false) THEN 20.00 ELSE 0.00 END;

  v_fee := ROUND((v_base * 0.15)::numeric, 2);

  NEW.base_price   := v_base;
  NEW.platform_fee := v_fee;
  NEW.total_price  := v_base + v_fee;

  RETURN NEW;
END;
$$;

-- ─── nearby_jobs — adds site resources; excludes key_location ─────────────────

CREATE OR REPLACE FUNCTION public.nearby_jobs(
  washer_lat float,
  washer_lng float,
  radius_km  int DEFAULT 15
)
RETURNS TABLE (
  id                  uuid,
  consumer_id         uuid,
  car_type            text,
  service_type        text,
  address_label       text,
  base_price          numeric,
  platform_fee        numeric,
  total_price         numeric,
  status              text,
  created_at          timestamptz,
  distance_km         float,
  site_has_water      boolean,
  site_has_power      boolean,
  addon_wiper_fluid   boolean,
  addon_tire_pressure boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    ROUND(
      (ST_Distance(
        o.location::geography,
        ST_SetSRID(ST_MakePoint(washer_lng, washer_lat), 4326)::geography
      ) / 1000.0)::numeric,
      2
    )::float AS distance_km,
    o.site_has_water,
    o.site_has_power,
    o.addon_wiper_fluid,
    o.addon_tire_pressure
  FROM public.orders o
  WHERE
    o.status = 'pending'
    AND ST_DWithin(
      o.location::geography,
      ST_SetSRID(ST_MakePoint(washer_lng, washer_lat), 4326)::geography,
      radius_km * 1000.0
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'washer' AND is_online = true
    )
  ORDER BY distance_km ASC;
$$;

GRANT EXECUTE ON FUNCTION public.nearby_jobs(float, float, int) TO authenticated;

-- ─── transition_order_status — enforce evidence before complete ───────────────

CREATE OR REPLACE FUNCTION public.transition_order_status(
  order_id   uuid,
  new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order      public.orders%rowtype;
  v_actor_role text;
  v_valid      boolean := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE id = auth.uid();

  IF v_order.status = 'pending'     AND new_status = 'accepted'    AND v_actor_role = 'washer'
    THEN v_valid := true; END IF;

  IF v_order.status = 'accepted'    AND new_status = 'en_route'    AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  IF v_order.status = 'en_route'    AND new_status = 'arrived'     AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  IF v_order.status = 'arrived'     AND new_status = 'in_progress' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  IF v_order.status = 'in_progress' AND new_status = 'completed'   AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  IF new_status = 'cancelled' THEN
    IF v_order.status IN ('pending', 'accepted') AND v_actor_role = 'consumer'
      THEN v_valid := true; END IF;
    IF v_order.status = 'accepted' AND v_actor_role = 'washer' AND v_order.washer_id = auth.uid()
      THEN v_valid := true; END IF;
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid transition: % → % for role %',
      v_order.status, new_status, COALESCE(v_actor_role, 'anonymous');
  END IF;

  -- Evidence enforcement: all required paths must be set before completing
  IF new_status = 'completed' THEN
    IF v_order.evidence_wash_path IS NULL THEN
      RAISE EXCEPTION 'Wash evidence required to complete order';
    END IF;
    IF v_order.addon_wiper_fluid AND v_order.evidence_wiper_fluid_path IS NULL THEN
      RAISE EXCEPTION 'Wiper fluid evidence required to complete order';
    END IF;
    IF v_order.addon_tire_pressure AND v_order.evidence_tire_pressure_path IS NULL THEN
      RAISE EXCEPTION 'Tire pressure evidence required to complete order';
    END IF;
  END IF;

  UPDATE public.orders SET
    status       = new_status,
    washer_id    = CASE WHEN new_status = 'accepted'  THEN auth.uid() ELSE washer_id  END,
    accepted_at  = CASE WHEN new_status = 'accepted'  THEN now()      ELSE accepted_at END,
    completed_at = CASE WHEN new_status = 'completed' THEN now()      ELSE completed_at END
  WHERE id = order_id;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (order_id, v_order.status, new_status, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, text) TO authenticated;
