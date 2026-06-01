-- Migration 0104: relax transition_order_status for underground-parking orders
--
-- ADR-035 (highest-risk change in this feature): redefine transition_order_status
-- so that when the order row's is_underground_parking = true, the two
-- reception-dependent gates are skipped:
--
--   en_route → arrived           : skip the GPS-required + arrival geofence
--                                  (accept null washer_lat/lng). The 4 arrival
--                                  photos stay mandatory.
--   in_progress → pending_approval: allow null GPS (do not reject on missing
--                                  coords). The 4 completion photos stay
--                                  mandatory. submitted_lat/lng stay null.
--
-- EVERY other behaviour is byte-for-byte identical to 0101:
--   * same 5-arg signature (uuid, text, double precision, double precision,
--     boolean) — null-coord callers keep working; the function reads
--     is_underground_parking from the order row itself, not from a new argument;
--   * the admin-override (force-stage) branch + its audit row are untouched;
--   * the config-driven arrival geofence get_config_number('arrival_geofence_meters', 100)
--     is preserved verbatim (0100);
--   * the admin_force_order_stage wrapper (0101) calls this by name — plpgsql
--     bodies create no hard dependency, so the DROP below does not break it, and
--     it is intentionally NOT recreated here.
--
-- DROP-before-CREATE per migration discipline (the arg list is unchanged, but the
-- CI state-machine guard asserts DROP precedes CREATE). No inner BEGIN/COMMIT —
-- the runner wraps this file in one transaction.

DROP FUNCTION IF EXISTS public.transition_order_status(uuid, text, double precision, double precision, boolean);

CREATE OR REPLACE FUNCTION public.transition_order_status(
  order_id          uuid,
  new_status        text,
  washer_lat        double precision DEFAULT NULL,
  washer_lng        double precision DEFAULT NULL,
  p_admin_override  boolean          DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order        public.orders%ROWTYPE;
  v_actor_role   text;
  v_actor_id     uuid := auth.uid();
  v_valid        boolean := false;
  v_is_admin     boolean := false;
  v_distance_m   double precision;
  v_geofence_m   double precision;
  v_force_reason text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE id = v_actor_id;

  v_is_admin := (p_admin_override IS TRUE) AND (v_actor_role = 'super_admin');

  -- Admin override path (force stage): ANY current status — forward, backward,
  -- skipping, or out of a terminal state — → any status in the CHECK set.
  -- No photo/GPS/geofence/sequence gate. The target MUST be in the allowed set
  -- or the UPDATE below would violate orders_status_check; validate for a clear
  -- error message instead of a constraint violation.
  IF v_is_admin THEN
    IF new_status NOT IN ('pending','accepted','en_route','arrived','in_progress','pending_approval','completed','cancelled') THEN
      RAISE EXCEPTION 'invalid status: %', new_status;
    END IF;
    v_valid := true;
  ELSE
    -- ── Normal paths (unchanged from 0066/0083/0100/0101 except the ADR-035
    --    underground relaxations flagged inline below) ──────────────────────────

    -- pending → accepted (any online washer, must not have active/pending-approval job)
    IF v_order.status = 'pending' AND new_status = 'accepted' AND v_actor_role = 'washer' THEN
      IF EXISTS (
        SELECT 1 FROM public.orders
         WHERE washer_id = v_actor_id
           AND status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
           AND id != order_id
      ) THEN
        RAISE EXCEPTION 'Cannot accept: you have an active or pending-approval job';
      END IF;
      v_valid := true;
    END IF;

    -- accepted → en_route (assigned washer only)
    IF v_order.status = 'accepted' AND new_status = 'en_route' AND v_actor_role = 'washer'
       AND v_order.washer_id = v_actor_id THEN v_valid := true; END IF;

    -- en_route → arrived (assigned washer, configurable geofence, 4 arrival photos).
    -- ADR-035: underground orders skip the GPS-required + geofence gates (no
    -- reception in a subterranean garage). The 4 arrival photos stay mandatory
    -- for every order; non-underground behaviour is byte-for-byte unchanged.
    IF v_order.status = 'en_route' AND new_status = 'arrived' AND v_actor_role = 'washer'
       AND v_order.washer_id = v_actor_id THEN
      IF NOT v_order.is_underground_parking THEN
        IF washer_lat IS NULL OR washer_lng IS NULL THEN
          RAISE EXCEPTION 'Worker location required for arrival';
        END IF;
        v_distance_m := ST_Distance(
          v_order.location::geography,
          ST_MakePoint(washer_lng, washer_lat)::geography
        );
        v_geofence_m := public.get_config_number('arrival_geofence_meters', 100);
        IF v_distance_m > v_geofence_m THEN
          RAISE EXCEPTION 'Too far from location: % meters', ROUND(v_distance_m::numeric);
        END IF;
      END IF;
      IF v_order.arrival_photo_front IS NULL OR v_order.arrival_photo_back IS NULL OR
         v_order.arrival_photo_driver IS NULL OR v_order.arrival_photo_passenger IS NULL THEN
        RAISE EXCEPTION 'Arrival photos required';
      END IF;
      v_valid := true;
    END IF;

    -- arrived → in_progress (assigned washer only)
    IF v_order.status = 'arrived' AND new_status = 'in_progress' AND v_actor_role = 'washer'
       AND v_order.washer_id = v_actor_id THEN v_valid := true; END IF;

    -- in_progress → pending_approval
    IF v_order.status = 'in_progress' AND new_status = 'pending_approval'
       AND v_actor_role = 'washer' AND v_order.washer_id = v_actor_id THEN
      IF v_order.completion_photo_front IS NULL OR v_order.completion_photo_back IS NULL OR
         v_order.completion_photo_driver IS NULL OR v_order.completion_photo_passenger IS NULL THEN
        RAISE EXCEPTION 'Completion photos required';
      END IF;
      -- ADR-035: underground orders may submit with null GPS (captured offline,
      -- no reception). submitted_lat/lng stay null for these — the agent approval
      -- card renders a "location unavailable (underground)" state, not a map.
      IF NOT v_order.is_underground_parking THEN
        IF washer_lat IS NULL OR washer_lng IS NULL THEN
          RAISE EXCEPTION 'Worker location required to submit for approval';
        END IF;
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
      IF v_order.status IN ('pending', 'accepted') AND v_actor_role = 'consumer'
        THEN v_valid := true; END IF;
      IF v_order.status IN ('accepted', 'en_route') AND v_actor_role = 'washer'
         AND v_order.washer_id = v_actor_id
        THEN v_valid := true; END IF;
      IF v_actor_role = 'agent'
         AND v_order.status NOT IN ('completed', 'cancelled')
        THEN v_valid := true; END IF;
    END IF;

    -- agent complete override: any non-terminal status
    IF new_status = 'completed'
       AND v_actor_role = 'agent'
       AND v_order.status NOT IN ('completed', 'cancelled') THEN
      v_valid := true;
    END IF;
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid transition: % → % for role %',
      v_order.status, new_status, COALESCE(v_actor_role, 'anonymous');
  END IF;

  UPDATE public.orders SET
    status                = new_status,
    washer_id             = CASE WHEN new_status = 'accepted' AND NOT v_is_admin THEN v_actor_id ELSE washer_id END,
    accepted_at           = CASE WHEN new_status = 'accepted' THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
    completed_at          = CASE WHEN new_status = 'completed' THEN now()     ELSE completed_at END,
    approved_at           = CASE WHEN new_status = 'completed' AND (v_actor_role = 'agent' OR v_is_admin)
                                 THEN now()      ELSE approved_at END,
    approved_by           = CASE WHEN new_status = 'completed' AND (v_actor_role = 'agent' OR v_is_admin)
                                 THEN v_actor_id ELSE approved_by END,
    cancelled_by          = CASE
                              WHEN new_status = 'cancelled' THEN
                                CASE
                                  WHEN v_is_admin            THEN 'agent'
                                  WHEN v_actor_role='consumer' THEN 'consumer'
                                  WHEN v_actor_role='washer'   THEN 'washer'
                                  WHEN v_actor_role='agent'    THEN 'agent'
                                  ELSE NULL
                                END
                              ELSE cancelled_by
                            END,
    submitted_lat         = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN washer_lat ELSE submitted_lat END,
    submitted_lng         = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN washer_lng ELSE submitted_lng END,
    submitted_location_at = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN now()     ELSE submitted_location_at END,
    submitted_for_approval_at = CASE WHEN new_status = 'pending_approval'
                                     THEN now() ELSE submitted_for_approval_at END
  WHERE id = order_id;

  -- Approval audit for agent approvals (unchanged behavior from 0066).
  IF new_status = 'completed' AND v_actor_role = 'agent' AND v_order.status = 'pending_approval' THEN
    INSERT INTO public.approval_audit (order_id, agent_id, action)
    VALUES (order_id, v_actor_id, 'approved');
  END IF;

  -- Admin override audit row. When invoked via admin_force_order_stage the
  -- wrapper sets app.force_stage_reason (txn-local); tag the row 'force_stage'
  -- and carry the reason. Otherwise keep the legacy labels (force-complete /
  -- cancel / force-status) so existing direct callers are unchanged.
  IF v_is_admin THEN
    v_force_reason := NULLIF(trim(current_setting('app.force_stage_reason', true)), '');
    INSERT INTO public.admin_order_audit (order_id, admin_id, action, reason, payload)
    VALUES (
      order_id, v_actor_id,
      CASE WHEN v_force_reason IS NOT NULL THEN 'force_stage'
           WHEN new_status = 'cancelled'   THEN 'cancel'
           WHEN new_status = 'completed'   THEN 'force_complete'
           ELSE 'force_status' END,
      v_force_reason,
      jsonb_build_object('from_status', v_order.status, 'to_status', new_status)
        || CASE WHEN v_force_reason IS NOT NULL
                THEN jsonb_build_object('reason', v_force_reason)
                ELSE '{}'::jsonb END
    );
  END IF;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (order_id, v_order.status, new_status, v_actor_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, text, double precision, double precision, boolean)
  TO authenticated;
