-- Migration 0077: transition_order_status arrival geofence + decline_order
-- auto-escalation threshold read from app_config with hardcoded fallback.
--
-- Each lookup is COALESCE(get_config_number(key, hardcoded_default)) — if the
-- app_config row is deleted or the helper fails, the behavior matches the
-- pre-P5 code exactly. The hardcoded defaults are the same values today:
--   arrival_geofence_meters     = 100
--   decline_auto_escalate_count = 3

-- ── decline_order: rewrite with config-backed threshold ─────────────────────

CREATE OR REPLACE FUNCTION public.decline_order(
  p_order_id  UUID,
  p_reason    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agent            UUID := auth.uid();
  v_order            public.orders%ROWTYPE;
  v_new_decline_count INT;
  v_threshold        INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_agent AND role = 'agent') THEN
    RAISE EXCEPTION 'not_agent';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Invalid transition: % → in_progress for role agent', v_order.status;
  END IF;

  UPDATE orders
     SET status                    = 'in_progress',
         decline_reason            = trim(p_reason),
         declined_by               = v_agent,
         declined_at               = now(),
         decline_count             = COALESCE(decline_count, 0) + 1,
         submitted_for_approval_at = NULL
   WHERE id = p_order_id
   RETURNING decline_count INTO v_new_decline_count;

  INSERT INTO order_events (order_id, from_status, to_status, actor_id)
  VALUES (p_order_id, 'pending_approval', 'in_progress', v_agent);

  INSERT INTO approval_audit (order_id, agent_id, action, reason)
  VALUES (p_order_id, v_agent, 'declined', trim(p_reason));

  v_threshold := public.get_config_number('decline_auto_escalate_count', 3)::int;
  IF v_new_decline_count >= v_threshold THEN
    IF NOT EXISTS (SELECT 1 FROM support_tickets WHERE order_id = p_order_id) THEN
      INSERT INTO support_tickets (order_id, consumer_id, washer_id, reason, initial_feedback)
      VALUES (
        p_order_id,
        v_order.consumer_id,
        v_order.washer_id,
        'manual',
        'Auto-escalated: order declined ' || v_new_decline_count || ' times'
      );
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_order(UUID, TEXT) TO authenticated;

-- ── transition_order_status: rewrite with config-backed geofence ────────────

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
  v_geofence_m DOUBLE PRECISION;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE id = auth.uid();

  IF v_order.status = 'pending' AND new_status = 'accepted' AND v_actor_role = 'washer' THEN
    IF EXISTS (
      SELECT 1 FROM public.orders
       WHERE washer_id = auth.uid()
         AND status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
         AND id != order_id
    ) THEN
      RAISE EXCEPTION 'Cannot accept: you have an active or pending-approval job';
    END IF;
    v_valid := true;
  END IF;

  IF v_order.status = 'accepted' AND new_status = 'en_route' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  IF v_order.status = 'en_route' AND new_status = 'arrived' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN
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
    IF v_order.arrival_photo_front IS NULL OR v_order.arrival_photo_back IS NULL OR
       v_order.arrival_photo_driver IS NULL OR v_order.arrival_photo_passenger IS NULL THEN
      RAISE EXCEPTION 'Arrival photos required';
    END IF;
    v_valid := true;
  END IF;

  IF v_order.status = 'arrived' AND new_status = 'in_progress' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

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

  IF v_order.status = 'pending_approval' AND new_status = 'completed'
     AND v_actor_role = 'agent' THEN
    v_valid := true;
  END IF;

  IF new_status = 'cancelled' THEN
    IF v_order.status IN ('pending', 'accepted') AND v_actor_role = 'consumer'
      THEN v_valid := true; END IF;
    IF v_order.status IN ('accepted', 'en_route') AND v_actor_role = 'washer'
       AND v_order.washer_id = auth.uid()
      THEN v_valid := true; END IF;
    IF v_actor_role = 'agent'
       AND v_order.status NOT IN ('completed', 'cancelled')
      THEN v_valid := true; END IF;
  END IF;

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
                                 THEN now()     ELSE submitted_location_at END,
    submitted_for_approval_at = CASE WHEN new_status = 'pending_approval'
                                     THEN now() ELSE submitted_for_approval_at END
  WHERE id = order_id;

  IF new_status = 'completed' AND v_actor_role = 'agent' AND v_order.status = 'pending_approval' THEN
    INSERT INTO public.approval_audit (order_id, agent_id, action)
    VALUES (order_id, auth.uid(), 'approved');
  END IF;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (order_id, v_order.status, new_status, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION)
  TO authenticated;
