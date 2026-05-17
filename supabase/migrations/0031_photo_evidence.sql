-- Migration 0031: Replace video evidence with 4-photo arrival + 4-photo completion sets.
--
-- Schema changes:
--   8 new nullable text columns on orders (4 arrival angles, 4 completion angles).
--   Legacy evidence_before_path / evidence_after_path columns are NOT dropped —
--   existing pending_approval orders still reference them.
--
-- transition_order_status changes (verbatim from 0030, two blocks replaced):
--   en_route → arrived: require all 4 arrival_photo_* non-null (additive to geofence).
--   in_progress → pending_approval: check completion_photo_* instead of evidence_before/after.
--   All other blocks (accepted, en_route GPS, agent cancel/complete, audit event) unchanged.

-- ── 1. Add photo columns ──────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS arrival_photo_front        TEXT,
  ADD COLUMN IF NOT EXISTS arrival_photo_back         TEXT,
  ADD COLUMN IF NOT EXISTS arrival_photo_driver       TEXT,
  ADD COLUMN IF NOT EXISTS arrival_photo_passenger    TEXT,
  ADD COLUMN IF NOT EXISTS completion_photo_front     TEXT,
  ADD COLUMN IF NOT EXISTS completion_photo_back      TEXT,
  ADD COLUMN IF NOT EXISTS completion_photo_driver    TEXT,
  ADD COLUMN IF NOT EXISTS completion_photo_passenger TEXT;

-- ── 2. transition_order_status (0031 body) ────────────────────────────────────
-- Full body from 0030. Changed blocks are annotated; everything else is verbatim.

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

  -- en_route → arrived (assigned washer only, 100 m geofence + all 4 arrival photos required)
  -- [0031 change: added photo check after geofence block]
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
    IF v_order.arrival_photo_front IS NULL OR v_order.arrival_photo_back IS NULL OR
       v_order.arrival_photo_driver IS NULL OR v_order.arrival_photo_passenger IS NULL THEN
      RAISE EXCEPTION 'Arrival photos required';
    END IF;
    v_valid := true;
  END IF;

  -- arrived → in_progress (assigned washer only)
  IF v_order.status = 'arrived' AND new_status = 'in_progress' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  -- in_progress → pending_approval (assigned washer; all 4 completion photos + GPS required)
  -- [0031 change: completion_photo_* replaces evidence_before/after check]
  IF v_order.status = 'in_progress' AND new_status = 'pending_approval'
     AND v_actor_role = 'washer' AND v_order.washer_id = auth.uid() THEN
    IF v_order.completion_photo_front IS NULL OR v_order.completion_photo_back IS NULL OR
       v_order.completion_photo_driver IS NULL OR v_order.completion_photo_passenger IS NULL THEN
      RAISE EXCEPTION 'Completion photos required';
    END IF;
    -- Worker location required to submit for approval (captured, not distance-enforced)
    IF washer_lat IS NULL OR washer_lng IS NULL THEN
      RAISE EXCEPTION 'Worker location required to submit for approval';
    END IF;
    v_valid := true;
  END IF;

  -- pending_approval → completed (agent only; normal approval path)
  IF v_order.status = 'pending_approval' AND new_status = 'completed'
     AND v_actor_role = 'agent' THEN
    v_valid := true;
  END IF;

  -- * → cancelled
  IF new_status = 'cancelled' THEN
    -- consumer: pending or accepted
    IF v_order.status IN ('pending', 'accepted') AND v_actor_role = 'consumer'
      THEN v_valid := true; END IF;
    -- assigned washer: accepted or en_route
    IF v_order.status IN ('accepted', 'en_route') AND v_actor_role = 'washer'
       AND v_order.washer_id = auth.uid()
      THEN v_valid := true; END IF;
    -- Agent can cancel from any non-terminal status
    IF v_actor_role = 'agent'
       AND v_order.status NOT IN ('completed', 'cancelled')
      THEN v_valid := true; END IF;
  END IF;

  -- Agent complete override: complete from any non-terminal status (bypasses pending_approval)
  IF new_status = 'completed'
     AND v_actor_role = 'agent'
     AND v_order.status NOT IN ('completed', 'cancelled') THEN
    v_valid := true;
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid transition: % → % for role %',
      v_order.status, new_status, COALESCE(v_actor_role, 'anonymous');
  END IF;

  UPDATE public.orders SET
    status                = new_status,
    washer_id             = CASE WHEN new_status = 'accepted'          THEN auth.uid()  ELSE washer_id             END,
    accepted_at           = CASE WHEN new_status = 'accepted'          THEN now()       ELSE accepted_at           END,
    completed_at          = CASE WHEN new_status = 'completed'         THEN now()       ELSE completed_at          END,
    approved_at           = CASE WHEN new_status = 'completed' AND v_actor_role = 'agent'
                                 THEN now()       ELSE approved_at           END,
    approved_by           = CASE WHEN new_status = 'completed' AND v_actor_role = 'agent'
                                 THEN auth.uid()  ELSE approved_by           END,
    submitted_lat         = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN washer_lat  ELSE submitted_lat         END,
    submitted_lng         = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN washer_lng  ELSE submitted_lng         END,
    submitted_location_at = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN now()       ELSE submitted_location_at END
  WHERE id = order_id;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (order_id, v_order.status, new_status, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION)
  TO authenticated;
