-- Migration 0105: support agent can flip an order's underground-parking flag
--
-- ADR-035 follow-up: a customer often only reports a no-reception garage AFTER
-- booking (via support chat). Agents need to mark such a regular order as
-- underground (or undo it) so the washer app switches that order to offline
-- photo capture and skips the GPS arrival geofence (0104).
--
-- SECURITY DEFINER + is_agent() gate mirrors how agents already act on orders
-- through transition_order_status / decline_order. Being SECURITY DEFINER, the
-- UPDATE bypasses RLS (no agent UPDATE policy on orders is needed). Blocked on
-- terminal orders — there is nothing left to capture once completed/cancelled.
--
-- No inner BEGIN/COMMIT — the runner wraps each file in one transaction.

CREATE OR REPLACE FUNCTION public.agent_set_order_underground(
  p_order_id uuid,
  p_value    boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_agent() THEN
    RAISE EXCEPTION 'not_authorized: agents only';
  END IF;

  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot change underground flag on a % order', v_status;
  END IF;

  UPDATE public.orders
     SET is_underground_parking = COALESCE(p_value, false)
   WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_set_order_underground(uuid, boolean) TO authenticated;
