-- Migration 0070: content_overrides table for runtime i18n key overrides.
--
-- The main app + support-app + admin-app each bundle their own static i18next
-- resources at build time. This table lets the super_admin override any
-- bundled string at runtime, keyed by (app, locale, key). On boot each app
-- calls loadOverrides() in src/lib/contentOverrides.js, which fetches its
-- (app, locale) rows and merges them on top of the bundle via
-- i18n.addResourceBundle(...).
--
-- Read access is anon — every visitor needs the latest copy. Write access is
-- super_admin only (via the admin console). This is by design.

BEGIN;

CREATE TABLE IF NOT EXISTS public.content_overrides (
  app         text        NOT NULL CHECK (app IN ('main', 'support', 'admin')),
  locale      text        NOT NULL CHECK (locale IN ('en', 'he')),
  key         text        NOT NULL,
  value       text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES public.profiles(id),
  PRIMARY KEY (app, locale, key)
);

CREATE INDEX IF NOT EXISTS idx_content_overrides_app_locale
  ON public.content_overrides (app, locale);

ALTER TABLE public.content_overrides ENABLE ROW LEVEL SECURITY;

-- ANON READ: public UI strings — anyone fetching overrides may read them.
-- This is deliberate; the override stream is no more sensitive than the
-- en.json / he.json bundles already shipped to the client.
DROP POLICY IF EXISTS "content_overrides anon read" ON public.content_overrides;
CREATE POLICY "content_overrides anon read"
  ON public.content_overrides FOR SELECT
  USING (true);

-- WRITE: super_admin only.
DROP POLICY IF EXISTS "content_overrides super_admin write" ON public.content_overrides;
CREATE POLICY "content_overrides super_admin write"
  ON public.content_overrides FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Realtime publication — admin edits should fan out to live clients.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'content_overrides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.content_overrides;
  END IF;
END $$;

COMMIT;
