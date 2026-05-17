-- Allow consumers to read completion photos from job-evidence for their own orders.
-- Path format: {orderId}/{setKey}/{slot}.jpg — first folder segment is the order UUID.
-- Previously only agents had a SELECT policy on this bucket.

CREATE POLICY "job-evidence: consumer reads own order photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-evidence'
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE id::text = (storage.foldername(name))[1]
        AND consumer_id = auth.uid()
    )
  );
