-- Add license plate and color columns to orders.
-- Photos remain nullable (no constraint change needed — already were nullable).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS car_plate TEXT,
  ADD COLUMN IF NOT EXISTS car_color TEXT;
