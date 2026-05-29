-- Migration 0088: design_overrides table for the P8 live design editor.
--
-- Same shape philosophy as content_overrides (0070): one row per
-- (component id, property). Anon SELECT — visual properties are no more
-- sensitive than CSS shipped in the bundle. super_admin write via
-- admin_set_design_override (0089) so bound validation runs server-side.
--
-- The `app` column lets us scope overrides to 'main' vs 'support'; the
-- admin app is NEVER instrumented per ADR-027.

BEGIN;

CREATE TABLE IF NOT EXISTS public.design_overrides (
  id          text        NOT NULL,                       -- dotted component id, e.g. consumer.home.bookCta
  app         text        NOT NULL CHECK (app IN ('main','support')),
  property    text        NOT NULL CHECK (property IN (
                            'color','bg','text_size','padding',
                            'border_radius','offset_x','offset_y'
                          )),
  value       jsonb       NOT NULL,                       -- { value: <numeric|string> }
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES public.profiles(id),
  PRIMARY KEY (app, id, property)
);

CREATE INDEX IF NOT EXISTS idx_design_overrides_app
  ON public.design_overrides (app);

ALTER TABLE public.design_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "design_overrides anon read"         ON public.design_overrides;
DROP POLICY IF EXISTS "design_overrides super_admin write" ON public.design_overrides;

-- ANON READ: same rationale as content_overrides 0070 — visual properties.
CREATE POLICY "design_overrides anon read"
  ON public.design_overrides FOR SELECT
  USING (true);

CREATE POLICY "design_overrides super_admin write"
  ON public.design_overrides FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Realtime — admin edits propagate to live users instantly (same as content_overrides).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='design_overrides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.design_overrides;
  END IF;
END $$;

COMMIT;
