-- One active order per vehicle (per consumer).
--
-- A consumer must not be able to book a second wash on the SAME license plate
-- while an earlier order on that plate is still live (anything other than a
-- terminal completed/cancelled). When the order finishes (or is cancelled) the
-- row leaves the partial index and the plate is free to book again.
--
-- Enforced atomically by a partial UNIQUE index so a double-tap / two-device race
-- cannot slip two live orders through (the client Order.handleBook also pre-checks
-- for a friendly message, but that check is racy on its own).
--
-- Notes:
--   • car_plate is stored digits-only (normalizePlate in vehicleLookup.js), so
--     equal plates compare equal. NULL plates are excluded — the guard only
--     applies when a plate is present (NULLs are distinct in a unique index too).
--   • Predicate uses a literal terminal-status set so it stays IMMUTABLE (required
--     for a partial index) AND auto-covers any future live status that gets added.
--   • Scoped to (consumer_id, car_plate) — matches "the customer can't open
--     another order on his own vehicle". (Prod is a clean slate as of 2026-06-19,
--     so creating this over existing rows cannot fail on a legacy duplicate.)

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_order_per_vehicle
  ON public.orders (consumer_id, car_plate)
  WHERE car_plate IS NOT NULL
    AND status NOT IN ('completed', 'cancelled');
