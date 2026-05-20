-- ── Ensure profiles.locale exists ────────────────────────────────────────────
-- Migration 0007 added this column but was marked applied by --bootstrap before
-- the ALTER TABLE ran on some DB instances. This migration is a safe re-apply:
-- IF NOT EXISTS means it is a no-op on instances where 0007 ran correctly, and
-- creates the column on instances where it was skipped.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locale text DEFAULT 'en'
    CHECK (locale IN ('en', 'he'));
