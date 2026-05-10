-- Add en_route → cancelled transition for washer role.
-- Only change from 0004_features.sql: the washer-cancel block now includes
-- 'en_route' alongside 'accepted' in the allowed-from-status check.

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
    -- Washer may cancel from accepted OR en_route (but not arrived or later).
    IF v_order.status IN ('accepted', 'en_route') AND v_actor_role = 'washer'
       AND v_order.washer_id = auth.uid()
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
