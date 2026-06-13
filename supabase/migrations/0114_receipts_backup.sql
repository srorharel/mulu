-- 0114_receipts_backup.sql — ADR-041 addendum: archive every receipt PDF.
--
-- Israeli bookkeeping requires retaining copies of issued receipts. The
-- send-receipt Edge Function now uploads each generated חשבונית מס/קבלה PDF
-- to the private 'receipts' storage bucket (path: <year>/invoice-receipt-
-- <number>.pdf, written with the service role) BEFORE emailing, and records
-- the path on the receipt row. The admin Receipts tab downloads via signed
-- URL (super_admin storage SELECT policy below — same lesson as 0090:
-- without it the signed-URL call silently fails).
--
-- Deliberately NOT purged by delete-account: receipts are retained financial
-- records (ADR-038 semantics); only the consumer snapshot on the row is
-- anonymized. The bucket is not in delete-account's purge list.

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS pdf_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "super_admin_read_receipts" ON storage.objects;
CREATE POLICY "super_admin_read_receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND public.is_super_admin()
  );

-- No INSERT/UPDATE/DELETE policies: only the Edge Function's service role
-- (which bypasses RLS) writes receipt PDFs.
