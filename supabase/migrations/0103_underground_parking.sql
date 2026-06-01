-- Migration 0103: underground-parking orders flag
--
-- ADR-035: an underground-parking order is one where the wash happens in a
-- covered/subterranean garage with no cellular/GPS reception. The washer cannot
-- get a usable GPS fix to satisfy the en_route→arrived geofence or the
-- in_progress→pending_approval location gate, and may have no network at all
-- while underground. This migration adds the boolean flag the booking flow sets;
-- 0104 relaxes transition_order_status for marked orders.
--
-- NOT NULL DEFAULT false is safe to add to an existing table: every existing row
-- is back-filled to false in the same statement (Postgres rewrites the column
-- with the default), so there is no rows-violate-constraint risk.
--
-- We deliberately add NO CHECK constraint tying is_underground_parking to a
-- non-empty access_notes: a CHECK would fail on every pre-existing row that has
-- the flag false and null notes, and (more importantly) "notes required when
-- underground" is a booking-time UX rule, not a storage invariant. It is enforced
-- client-side in the consumer booking form (Stage 2). See ADR-035 in DECISIONS.md.
--
-- No inner BEGIN/COMMIT — the runner wraps each file in one transaction.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_underground_parking boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.is_underground_parking IS
  'Order is in an underground/covered garage with no GPS reception. transition_order_status (0104) skips the arrival geofence + GPS gates for these orders; the washer app captures photos offline and replays on reconnect. Notes-required is enforced client-side, not via a DB CHECK.';
