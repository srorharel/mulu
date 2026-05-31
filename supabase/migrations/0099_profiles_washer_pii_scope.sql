-- Migration 0099: scope washer profile reads to the consumer's own order (audit HIGH #4)
--
-- ADR-032 (heal): 0002's "profiles: read online washers" policy
-- (USING role='washer' AND is_online=true) lets ANY authenticated user
-- `select * from profiles` for EVERY online washer — exposing live GPS
-- (current_location / last_lat / last_lng), phone, and washer_dealer_number of
-- the whole online fleet. The comment even calls it a "future washer-finder
-- feature" that was never built.
--
-- Fix: drop the blanket exposure and replace it with a policy that lets a
-- consumer read ONLY the profile of a washer tied to one of their OWN orders —
-- symmetric with the washer→consumer policy from 0040. RLS is row-level (it can't
-- expose a subset of columns), but scoping the ROW to "my washer" removes the
-- fleet-wide harvest while still letting the consumer's order-tracking screen
-- read their washer's name/phone/location (OrderTracking.jsx:163).
--
-- Recursion: the predicate must look at public.orders, whose own RLS references
-- public.profiles — the exact cycle 0039/0040 hit. So we wrap the lookup in a
-- SECURITY DEFINER helper (runs as owner, bypasses orders RLS), mirroring
-- is_assigned_consumer_of_current_washer() from 0040.
--
-- No status filter (matches 0040's reciprocal policy) so the washer's name is
-- still readable on completed orders / the rating screen; the order link itself
-- is the authorization. Agents keep full read via 0028 "Agents can read all
-- profiles"; super_admins via 0079/0090; washer↔assigned-consumer via 0040; own
-- profile via 0002 — none of which this migration touches.
--
-- Idempotent: DROP POLICY / CREATE OR REPLACE FUNCTION.
-- No inner BEGIN/COMMIT: the runner wraps each file in one transaction
-- (audit finding #7).

-- 1. Remove the fleet-wide online-washer exposure.
DROP POLICY IF EXISTS "profiles: read online washers" ON public.profiles;

-- 2. Recursion-safe helper: is p_washer_id the washer on one of MY orders?
CREATE OR REPLACE FUNCTION public.is_active_order_washer_for_consumer(p_washer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
     WHERE washer_id   = p_washer_id
       AND consumer_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_active_order_washer_for_consumer(uuid) TO authenticated;

-- 3. Consumer may read the profile of a washer on one of their own orders.
DROP POLICY IF EXISTS "profiles: consumer reads assigned washer" ON public.profiles;
CREATE POLICY "profiles: consumer reads assigned washer"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    role = 'washer'
    AND public.is_active_order_washer_for_consumer(id)
  );

NOTIFY pgrst, 'reload schema';
