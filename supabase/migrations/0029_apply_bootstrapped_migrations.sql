-- Migration 0029: apply effects of bootstrapped migrations 0020–0024
--
-- Migrations 0020–0024 were recorded in schema_migrations via --bootstrap
-- (SQL never executed). Three objects diverge from their expected state:
--
--   item 12: transition_order_status — 0019 body (admin-only approval).
--            0023 adds agent approval, agent cancel, agent complete override.
--   item 13: validate_order_prices   — 0018 body (flat wash = 100 for all types).
--            0024 adds category tiers: jeep = 120, pickup = 130, others = 100.
--   item 11: profiles missing from supabase_realtime publication.
--            0021 added it; 0022 explicitly kept it; it was never added.
--
-- schema_migrations rows for 0020–0024 are intentionally left untouched.
-- The runner (run-migrations.js) wraps each migration in BEGIN/COMMIT, so
-- no explicit transaction wrapper is needed here.
--
-- Caller impact analysis (grep of all transition_order_status call sites):
--   src/pages/washer/JobDetail.jsx     — new_status: 'accepted'       — unchanged
--   src/pages/consumer/OrderTracking.jsx — new_status: 'cancelled'    — unchanged
--   src/components/washer/JobDrawer.jsx  — new_status: trans.next     — tops out at
--                                          'pending_approval' (washer path), unchanged
--   src/components/washer/JobDrawer.jsx  — new_status: 'cancelled'    — unchanged
--   support-app/src/lib/approvals.js     — new_status: 'completed'    — THIS IS THE FIX;
--                                          was always failing for agents, now succeeds
--   support-app/src/components/OrderPanel.jsx — new_status: 'completed'|'cancelled' —
--                                          agent override now works as designed
-- No caller depended on the old failure behavior.

-- ── 1. transition_order_status (0023 body) ────────────────────────────────────

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
    status       = new_status,
    washer_id    = CASE WHEN new_status = 'accepted'   THEN auth.uid() ELSE washer_id    END,
    accepted_at  = CASE WHEN new_status = 'accepted'   THEN now()      ELSE accepted_at  END,
    completed_at = CASE WHEN new_status = 'completed'  THEN now()      ELSE completed_at END,
    approved_at  = CASE WHEN new_status = 'completed' AND v_actor_role = 'agent'
                        THEN now()      ELSE approved_at END,
    approved_by  = CASE WHEN new_status = 'completed' AND v_actor_role = 'agent'
                        THEN auth.uid() ELSE approved_by END
  WHERE id = order_id;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (order_id, v_order.status, new_status, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION)
  TO authenticated;

-- ── 2. validate_order_prices (0024 body: category-based) ─────────────────────

CREATE OR REPLACE FUNCTION public.validate_order_prices()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_base numeric(10, 2);
  v_fee  numeric(10, 2);
BEGIN
  IF NEW.service_type = 'wash' THEN
    IF NEW.car_type = 'jeep' THEN
      NEW.base_price   := 80.00;
      NEW.platform_fee := 40.00;
      NEW.total_price  := 120.00;
    ELSIF NEW.car_type = 'pickup' THEN
      NEW.base_price   := 90.00;
      NEW.platform_fee := 40.00;
      NEW.total_price  := 130.00;
    ELSE
      -- private / sedan / suv / van / null
      NEW.base_price   := 60.00;
      NEW.platform_fee := 40.00;
      NEW.total_price  := 100.00;
    END IF;
    RETURN NEW;
  END IF;

  -- Legacy pricing for non-'wash' service types (existing orders only).
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

-- ── 3. Add profiles to supabase_realtime publication ─────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- ── Verification block ────────────────────────────────────────────────────────
-- Raises an exception (rolls back the transaction) if anything is wrong.
-- All three checks use substrings that are distinctive to the target version
-- and absent from the previous (bootstrapped-over) versions.

DO $$
DECLARE
  v_fn_body    TEXT;
  v_price_body TEXT;
  v_in_rt      BOOLEAN;
BEGIN
  SELECT prosrc INTO v_fn_body FROM pg_proc WHERE proname = 'transition_order_status';

  -- Distinctive to 0023: the override block comment. 0019 and 0020 have no
  -- "Agent complete override" block; this string exists nowhere in those bodies.
  IF v_fn_body NOT LIKE '%Agent complete override%' THEN
    RAISE EXCEPTION 'VERIFY FAILED [item 12a]: transition_order_status missing agent complete override block';
  END IF;

  -- Distinctive to 0023: agent cancel branch. Neither 0019 nor 0020 allow
  -- agents to cancel; the phrase "agent can cancel" only appears in 0023.
  IF v_fn_body NOT LIKE '%Agent can cancel%' THEN
    RAISE EXCEPTION 'VERIFY FAILED [item 12b]: transition_order_status missing agent cancel branch';
  END IF;

  -- Belt-and-suspenders: confirm pending_approval→completed still uses 'agent',
  -- not 'admin' (the 0019 regression we are fixing).
  IF v_fn_body LIKE '%pending_approval%admin%' AND v_fn_body NOT LIKE '%pending_approval%agent%' THEN
    RAISE EXCEPTION 'VERIFY FAILED [item 12c]: transition_order_status still has admin check on pending_approval';
  END IF;

  SELECT prosrc INTO v_price_body FROM pg_proc WHERE proname = 'validate_order_prices';

  -- Distinctive to 0024: jeep tier sets total_price to 120.00. The 0018 body
  -- has no 120.00 anywhere (its maximum total is 160.00 for van/full, but the
  -- jeep branch with exactly 120.00 is unique to 0024's wash pricing).
  IF v_price_body NOT LIKE '%jeep%120.00%' THEN
    RAISE EXCEPTION 'VERIFY FAILED [item 13]: validate_order_prices missing jeep→120.00 tier';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'profiles'
  ) INTO v_in_rt;
  IF NOT v_in_rt THEN
    RAISE EXCEPTION 'VERIFY FAILED [item 11]: profiles not in supabase_realtime publication';
  END IF;

  RAISE NOTICE 'All 0029 verifications passed (items 11, 12, 13).';
END $$;
