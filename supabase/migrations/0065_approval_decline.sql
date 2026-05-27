-- ── Add agent decline path for pending_approval orders ────────────────────────
--
-- Root cause: the support-app Approve and Reject buttons both fired the same
-- approve handler. This migration adds the backend decline capability.
--
-- Decline moves the order from pending_approval → in_progress so the washer
-- can fix and resubmit. The agent must provide a reason (≥3 chars).

-- 1. Add decline tracking columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS decline_reason TEXT,
  ADD COLUMN IF NOT EXISTS declined_by    UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS declined_at    TIMESTAMPTZ;

-- 2. Create decline_order RPC (agent-only, self-contained)
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
  v_agent  UUID := auth.uid();
  v_status TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_agent AND role = 'agent') THEN
    RAISE EXCEPTION 'not_agent';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Invalid transition: % → in_progress for role agent', v_status;
  END IF;

  UPDATE orders
     SET status         = 'in_progress',
         decline_reason = trim(p_reason),
         declined_by    = v_agent,
         declined_at    = now()
   WHERE id = p_order_id;

  INSERT INTO order_events (order_id, from_status, to_status, actor_id)
  VALUES (p_order_id, 'pending_approval', 'in_progress', v_agent);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_order(UUID, TEXT) TO authenticated;
