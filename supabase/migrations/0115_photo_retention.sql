-- Migration 0115: 90-day car-photo retention (Privacy Policy §8.2 / Amendment 13).
--
-- Car photos (consumer pre-booking 4-angle + washer arrival/completion evidence)
-- must be auto-deleted from Supabase Storage 90 days after the order is marked
-- 'completed', UNLESS the order is still under an open dispute (support
-- conversation or content report). Financial/audit rows (order_events, receipts,
-- prices) are NOT touched — only the photo objects + their path columns.
--
-- Mechanism mirrors the receipts (0113) / legal-update (0108) pattern:
--   pg_cron (daily) → public.purge_stale_photos_tick() reads Vault secrets and
--   net.http_post → Edge Function `purge-stale-photos` (service role) which lists
--   purgeable objects, removes them from Storage, then nulls the path columns.
--
-- The actual Storage deletion lives in the Edge Function because the Storage API
-- (not raw SQL) is the reliable way to remove objects. The SQL side only supplies
-- the candidate list (dispute-aware) and records the purge.
--
-- DROP-before-CREATE for the TABLE-returning function per migration discipline.
-- No inner BEGIN/COMMIT — the runner wraps this file in one transaction. The
-- pg_cron block is guarded so the migration still applies cleanly where pg_cron
-- is not yet enabled (enable it once in the Supabase dashboard, then re-run the
-- scheduling snippet printed in the NOTICE).
--
-- One-time setup AFTER applying (documented, NOT executed here):
--   1. Deploy the Edge Function:  supabase functions deploy purge-stale-photos
--   2. Set its secret:            supabase secrets set TRIGGER_SECRET=<service_role_key>
--   3. Insert the Vault URL secret:
--        insert into vault.secrets (name, secret)
--        values ('purge_stale_photos_url',
--                'https://<project-ref>.supabase.co/functions/v1/purge-stale-photos');
--      ('service_role_key' already exists — reused by every fan-out trigger.)

-- ── Idempotency / audit marker ────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS photos_purged_at timestamptz;

-- ── Candidate list: dispute-aware, one row per (order, bucket, object path) ────
DROP FUNCTION IF EXISTS public.list_purgeable_photos(int);

CREATE FUNCTION public.list_purgeable_photos(p_retention_days int DEFAULT 90)
RETURNS TABLE(order_id uuid, bucket text, path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.id, p.bucket, p.path
  FROM public.orders o
  CROSS JOIN LATERAL (
    VALUES
      ('car-photos',  o.car_photo_1_path),
      ('car-photos',  o.car_photo_2_path),
      ('car-photos',  o.car_photo_front),
      ('car-photos',  o.car_photo_back),
      ('car-photos',  o.car_photo_driver),
      ('car-photos',  o.car_photo_passenger),
      ('job-evidence', o.arrival_photo_front),
      ('job-evidence', o.arrival_photo_back),
      ('job-evidence', o.arrival_photo_driver),
      ('job-evidence', o.arrival_photo_passenger),
      ('job-evidence', o.completion_photo_front),
      ('job-evidence', o.completion_photo_back),
      ('job-evidence', o.completion_photo_driver),
      ('job-evidence', o.completion_photo_passenger),
      ('job-evidence', o.evidence_before_path),
      ('job-evidence', o.evidence_after_path),
      ('job-evidence', o.evidence_wash_path),
      ('job-evidence', o.evidence_wiper_fluid_path),
      ('job-evidence', o.evidence_tire_pressure_path)
  ) AS p(bucket, path)
  WHERE o.status = 'completed'
    AND o.completed_at IS NOT NULL
    AND o.completed_at < now() - make_interval(days => p_retention_days)
    AND o.photos_purged_at IS NULL
    AND p.path IS NOT NULL
    -- Spare orders under an OPEN support dispute …
    AND NOT EXISTS (
      SELECT 1 FROM public.support_conversations sc
      WHERE sc.order_id = o.id
        AND sc.status IN ('open', 'pending_agent', 'assigned')
    )
    -- … or an unresolved UGC content report (ADR-039).
    AND NOT EXISTS (
      SELECT 1 FROM public.content_reports cr
      WHERE cr.order_id = o.id
        AND cr.status IN ('open', 'reviewed')
    );
$$;

-- ── Mark an order's photos purged + null every path column ─────────────────────
CREATE OR REPLACE FUNCTION public.mark_order_photos_purged(p_order_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.orders SET
    car_photo_1_path           = NULL,
    car_photo_2_path           = NULL,
    car_photo_front            = NULL,
    car_photo_back             = NULL,
    car_photo_driver           = NULL,
    car_photo_passenger        = NULL,
    arrival_photo_front        = NULL,
    arrival_photo_back         = NULL,
    arrival_photo_driver       = NULL,
    arrival_photo_passenger    = NULL,
    completion_photo_front     = NULL,
    completion_photo_back      = NULL,
    completion_photo_driver    = NULL,
    completion_photo_passenger = NULL,
    evidence_before_path       = NULL,
    evidence_after_path        = NULL,
    evidence_wash_path         = NULL,
    evidence_wiper_fluid_path  = NULL,
    evidence_tire_pressure_path = NULL,
    photos_purged_at           = now()
  WHERE id = ANY(p_order_ids);
$$;

-- These run with service-role (Edge Function) privileges only — never exposed to
-- consumers/washers/agents.
REVOKE ALL ON FUNCTION public.list_purgeable_photos(int)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_photos_purged(uuid[])  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_purgeable_photos(int)       TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_photos_purged(uuid[]) TO service_role;

-- ── pg_cron tick → Edge Function (Vault URL + service_role_key, non-blocking) ──
CREATE OR REPLACE FUNCTION public.purge_stale_photos_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'purge_stale_photos_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key'        LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'purge_stale_photos_tick: vault secrets not found — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('retention_days', 90)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'purge_stale_photos_tick: failed (non-blocking): %', sqlerrm;
END;
$$;

-- ── Schedule the daily tick (guarded: tolerates pg_cron not being enabled) ─────
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-stale-photos') THEN
    PERFORM cron.unschedule('purge-stale-photos');
  END IF;

  PERFORM cron.schedule(
    'purge-stale-photos',
    '0 3 * * *',                                   -- daily, 03:00 UTC
    $cron$SELECT public.purge_stale_photos_tick();$cron$
  );

  RAISE NOTICE 'purge-stale-photos cron scheduled (daily 03:00 UTC).';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron (%). Enable pg_cron in the Supabase dashboard, then run: select cron.schedule(''purge-stale-photos'', ''0 3 * * *'', ''select public.purge_stale_photos_tick();'');', sqlerrm;
END $$;

NOTIFY pgrst, 'reload schema';
