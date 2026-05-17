-- Migration 0039: Fix the policy added in 0038.
--
-- Bug: inside the EXISTS subquery on public.orders, the bare column reference `id`
-- was resolved by PostgreSQL to orders.id (not profiles.id), so the predicate became
-- `orders.consumer_id = orders.id` — always false.
--
-- Fix: rewrite using `id IN (SELECT consumer_id ...)` which avoids the ambiguous
-- bare-column scope entirely.

DROP POLICY IF EXISTS "profiles: washer reads assigned consumer" ON public.profiles;

CREATE POLICY "profiles: washer reads assigned consumer"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    role = 'consumer'
    AND id IN (
      SELECT consumer_id FROM public.orders
      WHERE washer_id = auth.uid()
    )
  );
