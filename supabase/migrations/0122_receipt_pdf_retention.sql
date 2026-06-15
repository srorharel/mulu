-- Migration 0122: 6-month receipt-PDF retention.
--
-- The receipt ROW is a legal/financial record (חשבונית מס/קבלה) and is kept
-- INDEFINITELY — Israeli tax law requires ~7 years, and 0115 already exempts
-- receipts from every purge. This migration only reclaims STORAGE: it deletes
-- the archived PDF blob from the private 'receipts' bucket ~6 months after the
-- receipt was issued, and nulls receipts.pdf_path. Nothing financial is lost —
-- the row holds a full snapshot, so the admin "Resend" button (admin_resend_receipt
-- → send-receipt) regenerates an identical PDF on demand at any time.
--
-- Mechanism mirrors the photo retention (0115) / receipts (0113) pattern:
--   pg_cron (daily) → public.purge_receipt_pdfs_tick() reads Vault secrets and
--   net.http_post → Edge Function `purge-receipt-pdfs` (service role) which lists
--   purgeable PDFs, removes them from Storage, then nulls pdf_path + stamps
--   pdf_purged_at.
--
-- The actual Storage deletion lives in the Edge Function because the Storage API
-- (not raw SQL — deleting storage.objects rows orphans the underlying blob) is
-- the reliable way to remove objects. The SQL side only supplies the candidate
-- list and records the purge.
--
-- DROP-before-CREATE for the TABLE-returning function per migration discipline.
-- No inner BEGIN/COMMIT — the runner wraps this file in one transaction. The
-- pg_cron block is guarded so the migration still applies cleanly where pg_cron
-- is not yet enabled.
--
-- One-time setup AFTER applying (documented, NOT executed here):
--   1. Deploy the Edge Function:  supabase functions deploy purge-receipt-pdfs
--   2. Set its secret:            supabase secrets set TRIGGER_SECRET=<service_role_key>
--   3. Insert the Vault URL secret:
--        insert into vault.secrets (name, secret)
--        values ('purge_receipt_pdfs_url',
--                'https://<project-ref>.supabase.co/functions/v1/purge-receipt-pdfs');
--      ('service_role_key' already exists — reused by every fan-out trigger.)

-- ── Idempotency / audit marker ────────────────────────────────────────────────
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS pdf_purged_at timestamptz;

-- ── Candidate list: one row per (receipt, archived PDF path) past the window ───
DROP FUNCTION IF EXISTS public.list_purgeable_receipt_pdfs(int);

CREATE FUNCTION public.list_purgeable_receipt_pdfs(p_retention_days int DEFAULT 180)
RETURNS TABLE(receipt_id uuid, path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.pdf_path
  FROM public.receipts r
  WHERE r.pdf_path IS NOT NULL                                       -- nulled ⇒ already purged (idempotent)
    AND r.created_at < now() - make_interval(days => p_retention_days);
$$;

-- ── Mark a receipt's PDF purged: null the path + stamp pdf_purged_at ───────────
-- The ROW is retained; only the regenerable storage blob reference is cleared.
CREATE OR REPLACE FUNCTION public.mark_receipt_pdfs_purged(p_receipt_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.receipts
  SET pdf_path = NULL, pdf_purged_at = now()
  WHERE id = ANY(p_receipt_ids);
$$;

-- These run with service-role (Edge Function) privileges only — never exposed to
-- consumers/washers/agents.
REVOKE ALL ON FUNCTION public.list_purgeable_receipt_pdfs(int)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_receipt_pdfs_purged(uuid[])     FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_purgeable_receipt_pdfs(int)    TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_receipt_pdfs_purged(uuid[])    TO service_role;

-- ── pg_cron tick → Edge Function (Vault URL + service_role_key, non-blocking) ──
CREATE OR REPLACE FUNCTION public.purge_receipt_pdfs_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'purge_receipt_pdfs_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key'        LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'purge_receipt_pdfs_tick: vault secrets not found — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('retention_days', 180)            -- ~6 months
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'purge_receipt_pdfs_tick: failed (non-blocking): %', sqlerrm;
END;
$$;

-- ── Schedule the daily tick (guarded: tolerates pg_cron not being enabled) ─────
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-receipt-pdfs') THEN
    PERFORM cron.unschedule('purge-receipt-pdfs');
  END IF;

  PERFORM cron.schedule(
    'purge-receipt-pdfs',
    '30 3 * * *',                                  -- daily, 03:30 UTC (after photo purge)
    $cron$SELECT public.purge_receipt_pdfs_tick();$cron$
  );

  RAISE NOTICE 'purge-receipt-pdfs cron scheduled (daily 03:30 UTC).';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron (%). Enable pg_cron in the Supabase dashboard, then run: select cron.schedule(''purge-receipt-pdfs'', ''30 3 * * *'', ''select public.purge_receipt_pdfs_tick();'');', sqlerrm;
END $$;

NOTIFY pgrst, 'reload schema';
