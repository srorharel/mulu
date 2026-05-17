-- Migration 0030: capture washer GPS at in_progress → pending_approval submission.
--
-- Why: the arrival geofence (en_route → arrived) proves the washer was at the job
-- site, but arrival and submission can be 30+ minutes apart. The agent needs the
-- GPS at the moment the washer pressed "Submit for approval" to audit that the job
-- was actually completed on-site.
--
-- What changes:
--   1. Three new nullable columns on orders: submitted_lat, submitted_lng,
--      submitted_location_at.
--   2. transition_order_status now REQUIRES washer_lat/washer_lng on the
--      in_progress → pending_approval branch and writes all three columns.
--      No distance check — capture, don't enforce.
--   3. Legacy orders already in pending_approval have NULL submitted coords;
--      the approval page shows "Location not recorded" for those.
--
-- Caller impact (only one call site reaches pending_approval):
--   src/components/washer/JobDrawer.jsx — advance() — updated to pass GPS when
--   isSubmitting (trans.next === 'pending_approval'), parallel to the isArriving
--   pattern already in place.
--
-- schema_migrations: no new rows needed — this is a genuine new migration.

-- ── 1. Add submission location columns ────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS submitted_lat         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS submitted_lng         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS submitted_location_at TIMESTAMPTZ;

-- ── 2. transition_order_status (0030 body) ────────────────────────────────────
-- Full body from 0029, with two changes in the in_progress → pending_approval
-- block (GPS required) and the UPDATE block (writes submitted_lat/lng/location_at).

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

  -- in_progress → pending_approval (assigned washer; evidence + GPS required)
  IF v_order.status = 'in_progress' AND new_status = 'pending_approval'
     AND v_actor_role = 'washer' AND v_order.washer_id = auth.uid() THEN
    IF v_order.evidence_before_path IS NULL OR v_order.evidence_after_path IS NULL THEN
      RAISE EXCEPTION 'Before and after evidence required to submit for approval';
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

-- ── Verification block ────────────────────────────────────────────────────────
-- Raises on failure so the runner transaction rolls back.

DO $$
DECLARE
  v_fn_body TEXT;
BEGIN
  SELECT prosrc INTO v_fn_body FROM pg_proc WHERE proname = 'transition_order_status';

  -- 0030a: GPS exception at submission — unique to this migration; absent from 0029/0023
  -- which only check arrival GPS. The full exception string is the distinctive anchor.
  IF v_fn_body NOT LIKE '%Worker location required to submit for approval%' THEN
    RAISE EXCEPTION 'VERIFY FAILED [0030a]: submission GPS requirement missing from function body';
  END IF;

  -- 0030b: submitted_lat is assigned in the UPDATE block via a CASE conditioned on
  -- new_status = pending_approval. The pattern allows for alignment whitespace between
  -- the column name and the = sign while still proving it is a CASE expression write
  -- (not just a comment mention or ELSE reference).
  IF v_fn_body NOT LIKE '%submitted_lat%CASE WHEN new_status =%' THEN
    RAISE EXCEPTION 'VERIFY FAILED [0030b]: submitted_lat CASE write not found in UPDATE block';
  END IF;

  -- 0030c: column actually exists on the table (ADD COLUMN IF NOT EXISTS is silent on
  -- pre-existing columns; this proves it landed).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'orders'
      AND column_name  = 'submitted_lat'
  ) THEN
    RAISE EXCEPTION 'VERIFY FAILED [0030c]: orders.submitted_lat column not found';
  END IF;

  RAISE NOTICE 'All 0030 verifications passed (items 0030a, 0030b, 0030c).';
END $$;
