-- Fix: the "one active order per vehicle" guard (0131) was too broad — it counted
-- orders that were never PAID, causing a false "you already have an active wash"
-- block when the customer sees no open order.
--
-- Why it misfired: the order row is created as status='pending' on the booking tap,
-- BEFORE payment (a scaffold simplification). A customer who backs out of checkout
-- leaves an unpaid 'pending' draft. That draft is invisible everywhere else —
-- `useConsumerActiveOrders` (the /home active-wash card), `nearby_jobs`, and the
-- washer read RLS ALL gate on `paid_at IS NOT NULL` (migration 0130). Only the 0131
-- guard didn't, so an unpaid draft nobody can see still blocked re-booking the plate.
--
-- Fix: a real active wash is a PAID, non-terminal order — the exact definition the
-- rest of the app uses. Recreate the partial unique index with `paid_at IS NOT NULL`
-- added to the predicate. Unpaid drafts no longer conflict (so re-booking works); a
-- second PAID active wash on the same plate is still prevented atomically.
--
-- The matching client pre-check (Order.handleBook) gains the same `paid_at` filter.
-- DROP-before-CREATE per migration discipline; the runner wraps the file in one txn.

DROP INDEX IF EXISTS public.uniq_active_order_per_vehicle;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_order_per_vehicle
  ON public.orders (consumer_id, car_plate)
  WHERE car_plate IS NOT NULL
    AND paid_at IS NOT NULL
    AND status NOT IN ('completed', 'cancelled');
