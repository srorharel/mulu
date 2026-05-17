-- Migration 0040: Replace the recursive profiles policy with a SECURITY DEFINER
-- function, breaking the RLS cycle that caused the app to hang on load.
--
-- Root cause (0039): the USING clause queried public.orders, which has its own RLS
-- referencing public.profiles for role checks → circular policy evaluation.
--
-- Fix: wrap the orders lookup in a SECURITY DEFINER function whose body runs as
-- the function owner (bypasses RLS on orders), so the cycle is never entered.

-- 1. Drop the recursive policy from 0039
DROP POLICY IF EXISTS "profiles: washer reads assigned consumer" ON public.profiles;

-- 2. Index so the lookup is O(log n) regardless of order volume
CREATE INDEX IF NOT EXISTS orders_washer_consumer_idx
  ON public.orders(washer_id, consumer_id);

-- 3. SECURITY DEFINER helper — runs as owner, no RLS on the inner orders scan
CREATE OR REPLACE FUNCTION public.is_assigned_consumer_of_current_washer(p_consumer_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE washer_id    = auth.uid()
      AND consumer_id  = p_consumer_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_assigned_consumer_of_current_washer(uuid) TO authenticated;

-- 4. Non-recursive policy
CREATE POLICY "profiles: washer reads assigned consumer"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    role = 'consumer'
    AND public.is_assigned_consumer_of_current_washer(id)
  );

NOTIFY pgrst, 'reload schema';
