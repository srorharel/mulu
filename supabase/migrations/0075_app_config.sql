-- Migration 0075: app_config table for live-editable runtime knobs.
--
-- key TEXT PRIMARY KEY, value JSONB, value_type TEXT for admin-UI hinting.
-- Anon read is deliberate — config values are not secrets. They are no more
-- sensitive than the prices already displayed in the consumer app.
-- Writes are super_admin only.
--
-- Seeded with:
--   nearby_job_radius_meters    = 15000   (current Edge Function default)
--   arrival_geofence_meters     = 100     (current transition_order_status literal)
--   decline_auto_escalate_count = 3       (current decline_order literal)
--   rating_gate_jobs            = 3       (current recompute_washer_tier literal)
--   signed_url_ttl_seconds      = 600     (current RatingModal value)
--   pricing_source              = 'hardcoded'   (P5 fallback flag)
--
-- The pricing_source flag MUST stay 'hardcoded' in this commit per P5 spec —
-- a human flips it to 'config' only after verifying both-path parity.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_config (
  key         text         PRIMARY KEY,
  value       jsonb        NOT NULL,
  value_type  text         NOT NULL CHECK (value_type IN ('number','string','boolean','json')),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  updated_by  uuid         REFERENCES public.profiles(id)
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config anon read" ON public.app_config;
CREATE POLICY "app_config anon read"
  ON public.app_config FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "app_config super_admin write" ON public.app_config;
CREATE POLICY "app_config super_admin write"
  ON public.app_config FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Realtime so the admin Config page sees other editors' changes live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'app_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_config;
  END IF;
END $$;

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- get_config_number / get_config_text — SECURITY DEFINER + STABLE so the
-- refactored functions can call them without RLS getting in the way and so
-- the planner can hoist the lookup out of inner loops.

CREATE OR REPLACE FUNCTION public.get_config_number(p_key text, p_default numeric)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT (value->>'value')::numeric
       FROM public.app_config
      WHERE key = p_key
        AND value_type = 'number'),
    p_default
  );
$$;

CREATE OR REPLACE FUNCTION public.get_config_text(p_key text, p_default text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT value->>'value'
       FROM public.app_config
      WHERE key = p_key
        AND value_type = 'string'),
    p_default
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_config_number(text, numeric) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_config_text(text, text)     TO authenticated, anon;

-- ── Seed ─────────────────────────────────────────────────────────────────────
INSERT INTO public.app_config (key, value, value_type) VALUES
  ('nearby_job_radius_meters',    '{"value": 15000}'::jsonb,    'number'),
  ('arrival_geofence_meters',     '{"value": 100}'::jsonb,      'number'),
  ('decline_auto_escalate_count', '{"value": 3}'::jsonb,        'number'),
  ('rating_gate_jobs',            '{"value": 3}'::jsonb,        'number'),
  ('signed_url_ttl_seconds',      '{"value": 600}'::jsonb,      'number'),
  ('pricing_source',              '{"value": "hardcoded"}'::jsonb, 'string')
ON CONFLICT (key) DO NOTHING;

COMMIT;
