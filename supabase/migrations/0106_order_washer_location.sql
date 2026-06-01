-- Migration 0106: scoped washer-location read for live consumer tracking.
--
-- The consumer order-tracking screen (OrderTracking.jsx) needs the assigned
-- washer's live position to animate a moving marker + show an ETA. We deliberately
-- do NOT add (or lean on) a profiles SELECT policy for this: 0099 already exposes
-- the washer's row to the consumer for ANY shared order (no status filter), and
-- widening location reads further reopens the fleet-wide washer-GPS leak that 0099
-- closed. Instead this SECURITY DEFINER RPC is the ONLY location read path used by
-- the tracking UI — it self-authorizes (consumer must own the order) AND scopes to
-- non-terminal statuses, so a completed/cancelled order, the wrong owner, or an
-- unassigned order all return ZERO rows. Polling this every few seconds is
-- effectively live (the washer writes last_lat/last_lng every 10s) without any
-- realtime profiles subscription.
--
-- Columns confirmed: orders.washer_id / orders.consumer_id (0001_init.sql:20-21),
-- profiles.last_lat / last_lng / last_location_at (0021_chat_and_location.sql:3-5).
--
-- Idempotent: DROP FUNCTION first (the RETURNS TABLE shape would otherwise block
-- a CREATE OR REPLACE if it ever changes). No inner BEGIN/COMMIT — the runner
-- wraps each file in one transaction.

DROP FUNCTION IF EXISTS public.get_order_washer_location(uuid);

CREATE FUNCTION public.get_order_washer_location(p_order_id uuid)
RETURNS TABLE (
  washer_id  uuid,
  lat        double precision,
  lng        double precision,
  updated_at timestamptz,
  status     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.washer_id, p.last_lat, p.last_lng, p.last_location_at, o.status
  FROM public.orders o
  JOIN public.profiles p ON p.id = o.washer_id
  WHERE o.id = p_order_id
    AND o.consumer_id = auth.uid()
    AND o.washer_id IS NOT NULL
    AND o.status IN ('accepted', 'en_route', 'arrived', 'in_progress');
$$;

-- Postgres grants EXECUTE to PUBLIC by default on CREATE FUNCTION, and anon is a
-- member of PUBLIC, so REVOKE FROM anon alone would NOT block anon — we must
-- revoke from PUBLIC first, then grant only to authenticated. (Even if anon did
-- call it, auth.uid() is NULL so consumer_id = NULL matches no rows — but we lock
-- it down regardless: this is the consumer location path and has no anon use.)
REVOKE EXECUTE ON FUNCTION public.get_order_washer_location(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_order_washer_location(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
