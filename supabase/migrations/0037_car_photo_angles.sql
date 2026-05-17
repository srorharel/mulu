-- Migration 0037: Add 4-angle consumer car photo columns.
-- Legacy columns car_photo_1_path / car_photo_2_path are kept (read-only from now on)
-- so existing orders continue to render correctly.
--
-- Path convention for new orders:
--   {consumer_id}/{order_id}/{front|back|driver|passenger}.jpg
-- (same first-segment = consumer UID as legacy — existing INSERT/UPDATE/DELETE/SELECT
--  policies for consumers remain valid without changes)
--
-- The washer SELECT policy is updated to join on the 4 new columns in addition to
-- the legacy ones, because it is path-column-specific rather than path-pattern-based.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS car_photo_front      TEXT,
  ADD COLUMN IF NOT EXISTS car_photo_back       TEXT,
  ADD COLUMN IF NOT EXISTS car_photo_driver     TEXT,
  ADD COLUMN IF NOT EXISTS car_photo_passenger  TEXT;

-- Update washer read policy to cover the new angle columns.
DROP POLICY IF EXISTS "car-photos: washer reads assigned order photos" ON storage.objects;

CREATE POLICY "car-photos: washer reads assigned order photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'car-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'washer'
    )
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE washer_id = auth.uid()
        AND (
          car_photo_1_path    = name OR
          car_photo_2_path    = name OR
          car_photo_front     = name OR
          car_photo_back      = name OR
          car_photo_driver    = name OR
          car_photo_passenger = name
        )
    )
  );

NOTIFY pgrst, 'reload schema';
