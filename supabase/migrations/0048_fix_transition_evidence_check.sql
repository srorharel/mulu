-- ── Fix transition_order_status: restore completion_photo_* evidence check ────
--
-- Root cause: migration 0042 rewrote this function "verbatim from 0023", but
-- 0023 predates 0031. Migration 0031 had already replaced the old check:
--
--   evidence_before_path IS NULL OR evidence_after_path IS NULL  ← 0023 (wrong)
--
-- with the current photo system:
--
--   completion_photo_front/back/driver/passenger IS NULL          ← 0031 (correct)
--
-- 0042's rewrite silently rolled back the 0031 fix. The UI uploads to
-- completion_photo_* columns and never touches evidence_before_path or
-- evidence_after_path, so the old check always raises the exception.
--
-- This migration is the authoritative merge of all changes through 0044:
--   • completion_photo_* check + arrival_photo_* check     (from 0031)
--   • submitted_lat / submitted_lng / submitted_location_at (from 0031)
--   • cancelled_by stamped from v_actor_role               (from 0042)
--   • agent cancel + agent complete override               (from 0023)
--   • SET search_path = public, pg_temp                   (from 0044)

CREATE OR REPLACE FUNCTION public.transition_order_status(
  order_id   UUID,
  new_status TEXT,
  washer_lat DOUBLE PRECISION DEFAULT NULL,
  washer_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  -- en_route → arrived (assigned washer only, 100 m geofence, all 4 arrival photos required)
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

  -- in_progress → pending_approval
  -- Requires all 4 completion photos and GPS location. Does NOT check the legacy
  -- evidence_before_path / evidence_after_path columns — those were replaced by
  -- completion_photo_* in migration 0031 and are never written by the current UI.
  IF v_order.status = 'in_progress' AND new_status = 'pending_approval'
     AND v_actor_role = 'washer' AND v_order.washer_id = auth.uid() THEN
    IF v_order.completion_photo_front IS NULL OR v_order.completion_photo_back IS NULL OR
       v_order.completion_photo_driver IS NULL OR v_order.completion_photo_passenger IS NULL THEN
      RAISE EXCEPTION 'Completion photos required';
    END IF;
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
    -- agent: any non-terminal status
    IF v_actor_role = 'agent'
       AND v_order.status NOT IN ('completed', 'cancelled')
      THEN v_valid := true; END IF;
  END IF;

  -- agent complete override: any non-terminal status (bypasses evidence / pending_approval)
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
    washer_id             = CASE WHEN new_status = 'accepted' THEN auth.uid() ELSE washer_id END,
    accepted_at           = CASE WHEN new_status = 'accepted' THEN now()      ELSE accepted_at END,
    completed_at          = CASE WHEN new_status = 'completed' THEN now()     ELSE completed_at END,
    approved_at           = CASE WHEN new_status = 'completed' AND v_actor_role = 'agent'
                                 THEN now()      ELSE approved_at END,
    approved_by           = CASE WHEN new_status = 'completed' AND v_actor_role = 'agent'
                                 THEN auth.uid() ELSE approved_by END,
    cancelled_by          = CASE
                              WHEN new_status = 'cancelled' THEN
                                CASE v_actor_role
                                  WHEN 'consumer' THEN 'consumer'
                                  WHEN 'washer'   THEN 'washer'
                                  WHEN 'agent'    THEN 'agent'
                                  ELSE NULL
                                END
                              ELSE cancelled_by
                            END,
    submitted_lat         = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN washer_lat ELSE submitted_lat END,
    submitted_lng         = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN washer_lng ELSE submitted_lng END,
    submitted_location_at = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN now()     ELSE submitted_location_at END
  WHERE id = order_id;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (order_id, v_order.status, new_status, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION)
  TO authenticated;
