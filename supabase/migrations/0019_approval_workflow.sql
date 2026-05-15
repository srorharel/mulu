-- ── 1. Add 'admin' to profile roles ──────────────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('consumer', 'washer', 'agent', 'admin'));

-- ── 2. Add 'pending_approval' to allowed order statuses ──────────────────────
-- The status check in 0001_init.sql was defined inline and auto-named by Postgres.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending', 'accepted', 'en_route', 'arrived',
    'in_progress', 'pending_approval', 'completed', 'cancelled'
  ]));

-- ── 3. New evidence + approval tracking columns ───────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS evidence_before_path TEXT,
  ADD COLUMN IF NOT EXISTS evidence_after_path  TEXT,
  ADD COLUMN IF NOT EXISTS approved_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by          UUID REFERENCES public.profiles(id);

-- ── 4. Replace transition_order_status ───────────────────────────────────────
-- Changes vs 0016:
--   REMOVED:  in_progress → completed (washer) — workers now submit for approval
--   REMOVED:  evidence_wash_path / wiper / tire check on completed (legacy concern only)
--   ADDED:    in_progress → pending_approval (washer, before + after evidence required)
--   ADDED:    pending_approval → completed (admin only)
--   ADDED:    approved_at / approved_by stamped on pending_approval → completed
-- Everything else (geofence, cancel rules, accepted_at, audit event) is verbatim.
CREATE OR REPLACE FUNCTION public.transition_order_status(
  order_id   UUID,
  new_status TEXT,
  washer_lat DOUBLE PRECISION DEFAULT NULL,
  washer_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order      public.orders%ROWTYPE;
  v_actor_role TEXT;
  v_valid      BOOLEAN := false;
  v_distance_m DOUBLE PRECISION;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE id = auth.uid();

  -- pending → accepted (any online washer)
  IF v_order.status = 'pending' AND new_status = 'accepted' AND v_actor_role = 'washer'
    THEN v_valid := true; END IF;

  -- accepted → en_route (assigned washer only)
  IF v_order.status = 'accepted' AND new_status = 'en_route' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  -- en_route → arrived (assigned washer only, 100 m geofence)
  IF v_order.status = 'en_route' AND new_status = 'arrived' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN
    IF washer_lat IS NULL OR washer_lng IS NULL THEN
      RAISE EXCEPTION 'Worker location required for arrival';
    END IF;
    v_distance_m := ST_Distance(
      v_order.location::geography,
      ST_MakePoint(washer_lng, washer_lat)::geography
    );
    IF v_distance_m > 100 THEN
      RAISE EXCEPTION 'Too far from location: % meters', ROUND(v_distance_m::numeric);
    END IF;
    v_valid := true;
  END IF;

  -- arrived → in_progress (assigned washer only)
  IF v_order.status = 'arrived' AND new_status = 'in_progress' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  -- in_progress → pending_approval (assigned washer; before + after evidence required)
  IF v_order.status = 'in_progress' AND new_status = 'pending_approval'
     AND v_actor_role = 'washer' AND v_order.washer_id = auth.uid() THEN
    IF v_order.evidence_before_path IS NULL OR v_order.evidence_after_path IS NULL THEN
      RAISE EXCEPTION 'Before and after evidence required to submit for approval';
    END IF;
    v_valid := true;
  END IF;

  -- pending_approval → completed (admin only; sets approved_at / approved_by)
  IF v_order.status = 'pending_approval' AND new_status = 'completed'
     AND v_actor_role = 'admin' THEN
    v_valid := true;
  END IF;

  -- * → cancelled
  --   consumer: pending or accepted
  --   assigned washer: accepted or en_route
  IF new_status = 'cancelled' THEN
    IF v_order.status IN ('pending', 'accepted') AND v_actor_role = 'consumer'
      THEN v_valid := true; END IF;
    IF v_order.status IN ('accepted', 'en_route') AND v_actor_role = 'washer'
       AND v_order.washer_id = auth.uid()
      THEN v_valid := true; END IF;
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid transition: % → % for role %',
      v_order.status, new_status, COALESCE(v_actor_role, 'anonymous');
  END IF;

  UPDATE public.orders SET
    status       = new_status,
    washer_id    = CASE WHEN new_status = 'accepted'   THEN auth.uid() ELSE washer_id    END,
    accepted_at  = CASE WHEN new_status = 'accepted'   THEN now()      ELSE accepted_at  END,
    completed_at = CASE WHEN new_status = 'completed'  THEN now()      ELSE completed_at END,
    approved_at  = CASE WHEN new_status = 'completed'
                          AND v_order.status = 'pending_approval'
                        THEN now()      ELSE approved_at END,
    approved_by  = CASE WHEN new_status = 'completed'
                          AND v_order.status = 'pending_approval'
                        THEN auth.uid() ELSE approved_by END
  WHERE id = order_id;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (order_id, v_order.status, new_status, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- ── 5. RLS: admins can read all orders ───────────────────────────────────────
CREATE POLICY "Admins can read all orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── 6. RLS: admins can read all profiles ─────────────────────────────────────
CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
