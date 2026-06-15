-- Migration 0123: REVERT the receipt-PDF retention (0122).
--
-- Receipt PDFs are the ORIGINAL חשבונית מס/קבלה documents the business files with
-- the tax authority every month — they must be retained permanently, NOT purged.
-- 0122's 6-month PDF purge was therefore wrong and is fully removed here: the
-- cron is unscheduled, the purge functions dropped, and the audit column dropped.
-- Both the receipt row AND its archived PDF are now kept indefinitely.
--
-- (The `purge_receipt_pdfs_url` Vault secret + the deployed `purge-receipt-pdfs`
-- Edge Function are removed out-of-band — they are not schema objects. On a fresh
-- deploy 0122 creates these DB objects and 0123 immediately drops them again, so
-- the net schema is clean.)
--
-- No inner BEGIN/COMMIT — the runner wraps this file in one transaction.

-- ── Unschedule the daily purge (guarded: tolerates pg_cron absent / job gone) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-receipt-pdfs') THEN
    PERFORM cron.unschedule('purge-receipt-pdfs');
    RAISE NOTICE 'purge-receipt-pdfs cron unscheduled.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not unschedule purge-receipt-pdfs (%) — safe to ignore if pg_cron is not enabled.', sqlerrm;
END $$;

-- ── Drop the purge machinery ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.purge_receipt_pdfs_tick();
DROP FUNCTION IF EXISTS public.list_purgeable_receipt_pdfs(int);
DROP FUNCTION IF EXISTS public.mark_receipt_pdfs_purged(uuid[]);

-- ── Drop the now-unused audit column ──────────────────────────────────────────
ALTER TABLE public.receipts DROP COLUMN IF EXISTS pdf_purged_at;

NOTIFY pgrst, 'reload schema';
