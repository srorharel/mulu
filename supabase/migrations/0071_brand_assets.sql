-- Migration 0071: brand_assets bucket + app_branding mapping table.
--
-- A public storage bucket holds the brand assets (logos / hero images). The
-- app_branding table maps a slug ("main_logo", "support_logo", "login_hero")
-- to the current URL. Apps consume slugs via useBrandAsset(), which falls
-- back to the bundled asset when the row is missing or the network is down.
--
-- Anon read on app_branding is deliberate: brand assets are public, no more
-- sensitive than the bundled /logo.png that ships in every APK. Writes are
-- super_admin only.
--
-- Mobile bake limit (documented in admin UI banner): swapping logo here
-- does NOT change Android launcher icons or splash screens on already-
-- installed APKs. Those are baked at build time and need an app-store
-- update. See admin-app/src/pages/Branding.jsx.

BEGIN;

-- 1. Public bucket — 10 MB, image MIME types only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-assets',
  'brand-assets',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage policies
DROP POLICY IF EXISTS "brand_assets_public_read"     ON storage.objects;
DROP POLICY IF EXISTS "brand_assets_super_admin_rw"  ON storage.objects;

CREATE POLICY "brand_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-assets');

CREATE POLICY "brand_assets_super_admin_rw"
  ON storage.objects FOR ALL
  USING (bucket_id = 'brand-assets' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'brand-assets' AND public.is_super_admin());

-- 3. Mapping table — slug → URL
CREATE TABLE IF NOT EXISTS public.app_branding (
  slug        text         PRIMARY KEY,
  url         text         NOT NULL,
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  updated_by  uuid         REFERENCES public.profiles(id)
);

ALTER TABLE public.app_branding ENABLE ROW LEVEL SECURITY;

-- ANON READ: brand URLs are public — no more sensitive than the bundled images.
DROP POLICY IF EXISTS "app_branding anon read" ON public.app_branding;
CREATE POLICY "app_branding anon read"
  ON public.app_branding FOR SELECT
  USING (true);

-- WRITE: super_admin only.
DROP POLICY IF EXISTS "app_branding super_admin write" ON public.app_branding;
CREATE POLICY "app_branding super_admin write"
  ON public.app_branding FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_branding'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_branding;
  END IF;
END $$;

COMMIT;
