-- Migration 0100: restore the config-driven arrival geofence (audit HIGH #5)
--
-- ADR-033 (heal): 0077 made the en_route→arrived geofence configurable
-- (v_geofence_m := get_config_number('arrival_geofence_meters', 100)). 0083
-- (the p_admin_override rewrite) was rebuilt from the 0066 body and silently
-- reverted the check to a hardcoded `IF v_distance_m > 100`, dropping the
-- v_geofence_m lookup. Result: the admin Config knob `arrival_geofence_meters`
-- has been inert for arrivals ever since.
--
-- This re-applies the LATEST (0083, 5-arg) definition verbatim and re-wires only
-- the geofence to read the config knob again — default 100 m, so behaviour is
-- unchanged unless an admin sets the knob. Everything else (admin override path,
-- photo/GPS gates, transition matrix, audit writes) is identical to 0083.
--
-- Signature is unchanged (5 args), but we DROP first anyway per the project's
-- migration discipline (and so the CI state-machine guard's DROP-before-CREATE
-- assertion holds). plpgsql bodies create no hard dependency on the function, so
-- the DROP is safe; the GRANT is re-applied below.
--
-- Idempotent: DROP FUNCTION IF EXISTS the exact signature, then CREATE OR REPLACE.
-- No inner BEGIN/COMMIT: the runner wraps each file in one transaction, so the
-- DROP + CREATE already roll back atomically on failure (audit finding #7).

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
  v_order      public.orders%ROWTYPE;
  v_actor_role text;
  v_actor_id   uuid := auth.uid();
  v_valid      boolean := false;
  v_is_admin   boolean := false;
  v_distance_m double precision;
  v_geofence_m double precision;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE id = v_actor_id;

  v_is_admin := (p_admin_override IS TRUE) AND (v_actor_role = 'super_admin');

  -- Admin override path: any non-terminal → any allowed status, no photo/GPS.
  IF v_is_admin THEN
    IF v_order.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'cannot transition terminal order (status=%)', v_order.status;
    END IF;
    IF new_status NOT IN ('pending','accepted','en_route','arrived','in_progress','pending_approval','completed','cancelled') THEN
      RAISE EXCEPTION 'invalid status: %', new_status;
    END IF;
    v_valid := true;
  ELSE
    -- ── Normal paths (unchanged from 0066/0083) ───────────────────────────────

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

    -- en_route → arrived (assigned washer, configurable geofence, 4 arrival photos)
    IF v_order.status = 'en_route' AND new_status = 'arrived' AND v_actor_role = 'washer'
       AND v_order.washer_id = v_actor_id THEN
      IF washer_lat IS NULL OR washer_lng IS NULL THEN
        RAISE EXCEPTION 'Worker location required for arrival';
      END IF;
      v_distance_m := ST_Distance(
        v_order.location::geography,
        ST_MakePoint(washer_lng, washer_lat)::geography
      );
      -- Restored: read the geofence radius from app_config (default 100 m).
      v_geofence_m := public.get_config_number('arrival_geofence_meters', 100);
      IF v_distance_m > v_geofence_m THEN
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
       AND v_order.washer_id = v_actor_id THEN v_valid := true; END IF;

    -- in_progress → pending_approval
    IF v_order.status = 'in_progress' AND new_status = 'pending_approval'
       AND v_actor_role = 'washer' AND v_order.washer_id = v_actor_id THEN
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

  -- Admin override audit row
  IF v_is_admin THEN
    INSERT INTO public.admin_order_audit (order_id, admin_id, action, payload)
    VALUES (
      order_id, v_actor_id,
      CASE WHEN new_status = 'cancelled' THEN 'cancel'
           WHEN new_status = 'completed' THEN 'force_complete'
           ELSE 'force_status' END,
      jsonb_build_object('from_status', v_order.status, 'to_status', new_status)
    );
  END IF;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (order_id, v_order.status, new_status, v_actor_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, text, double precision, double precision, boolean)
  TO authenticated;
