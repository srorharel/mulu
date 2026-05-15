-- Fix orders CHECK constraints to match the current app.
--
-- Background:
--   0001_init.sql created inline constraints that Postgres may auto-name as
--   orders_car_type_check / orders_service_type_check (or unnamed, depending on
--   PG version).  Migration 0024 tried to DROP + ADD orders_car_type_check, but
--   if the original had a different internal name the DROP was a silent no-op,
--   leaving a second constraint that rejects 'private' / 'jeep'.
--
--   service_type was never updated after the app moved to 'wash'-only orders,
--   so 'wash' is not in the constraint — the live DB has probably had RLS or
--   the trigger mask the failure, but seed.sql now hits it directly.
--
-- This migration drops every car_type and service_type check on the orders table
-- (by scanning pg_constraint) and re-creates clean, definitive versions.

DO $$
DECLARE
  r record;
BEGIN
  -- Drop all check constraints on orders that reference car_type or service_type.
  FOR r IN
    SELECT conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'c'
      AND n.nspname = 'public'
      AND t.relname = 'orders'
      AND pg_get_constraintdef(c.oid) ~* 'car_type|service_type'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END;
$$;

-- car_type: legacy values (sedan/suv/van/pickup) kept for existing orders;
-- new pricing categories (private/jeep) added for current bookings.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_car_type_check
  CHECK (car_type IS NULL OR car_type = ANY (ARRAY[
    'sedan', 'suv', 'van', 'pickup',
    'private', 'jeep'
  ]));

-- service_type: 'wash' is the only type created by the app since migration 0018.
-- Legacy types are preserved so existing orders are not invalidated.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_service_type_check
  CHECK (service_type = ANY (ARRAY['wash', 'exterior', 'interior', 'full']));
