-- Migration 0038: Allow a washer to read the profile of their assigned consumer.
--
-- Root cause of the missing call button:
--   JobDrawer fetches the consumer's profile (id, full_name, phone) to populate the
--   customer card and render the tel: call link.  No existing profiles RLS policy
--   permits this read:
--     "profiles: read own"            only matches id = auth.uid()  (washer ≠ consumer)
--     "profiles: read online washers" only matches role = 'washer'   (consumer is not a washer)
--   The query succeeds structurally but PostgREST returns zero rows, so `data` is null,
--   consumerProfile stays null, and `consumerProfile?.phone` is never truthy → button
--   never renders.
--
-- Fix: let a washer SELECT any consumer profile whose consumer_id appears on one of
-- the washer's own assigned orders.  Scope is tight — no cross-order leakage.

CREATE POLICY "profiles: washer reads assigned consumer"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    role = 'consumer'
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE washer_id  = auth.uid()
        AND consumer_id = id
    )
  );
