-- RLS policies for the car-photos storage bucket.
-- The bucket was created manually without policies, causing consumer uploads
-- to fail with "new row violates row-level security policy".
--
-- Path convention: {consumer_user_id}/{draft_order_id}/{0|1}.jpg
-- The first folder segment is the consumer's auth.uid(), enabling INSERT,
-- UPDATE and DELETE to be verified via folder check alone (no DB join).
--
-- Asymmetry vs. job-evidence (documented for future maintainers):
--   • job-evidence has no INSERT policy in migrations — that bucket was
--     created with RLS disabled; washer uploads work without a policy.
--   • car-photos INSERT uses a folder check (auth.uid() as first segment)
--     because photos are uploaded BEFORE the order row is created, so an
--     order-table join is impossible at upload time.
--   • car-photos SELECT for washers joins orders.car_photo_1/2_path because
--     the first path segment belongs to the consumer, not the washer.

-- ── INSERT ─────────────────────────────────────────────────────────────────
-- Consumer only (role = 'consumer' check matches 0002_rls.sql convention).
CREATE POLICY "car-photos: consumer upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'consumer'
    )
  );

-- ── UPDATE ─────────────────────────────────────────────────────────────────
-- CarPhotoUpload uses upsert: true, which issues an UPDATE when the object
-- already exists. Without this policy the second attempt (replacing a photo)
-- would be blocked.
CREATE POLICY "car-photos: consumer update own folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'consumer'
    )
  )
  WITH CHECK (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'consumer'
    )
  );

-- ── DELETE ─────────────────────────────────────────────────────────────────
-- Consumer removes a photo before booking (CarPhotoUpload handleRemove).
CREATE POLICY "car-photos: consumer delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'consumer'
    )
  );

-- ── SELECT ─────────────────────────────────────────────────────────────────

-- Consumer reads own folder (blob URLs cover the booking flow; this enables
-- future signed-URL access e.g. order history photo previews).
CREATE POLICY "car-photos: consumer read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'consumer'
    )
  );

-- Washer reads photos for their currently assigned order only.
-- Cannot use folder check here (first segment = consumer_id, not washer_id),
-- so we join orders on the stored path columns instead.
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
        AND (car_photo_1_path = name OR car_photo_2_path = name)
    )
  );

-- Agent reads all car photos for approval workflow review.
-- Matches the job-evidence pattern in 0020_agent_approvals.sql.
CREATE POLICY "car-photos: agent reads all"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'car-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agent'
    )
  );
