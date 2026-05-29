-- Migration 0085: profile suspension columns.
--
-- A suspended profile is signed out on next profile fetch by every client
-- (main app + support app + admin app — though super_admin cannot be
-- suspended via the RPC in 0086, defensive read in admin app too).
--
-- Idempotent ADD COLUMN IF NOT EXISTS so a re-run / bootstrap heal is safe.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_at      timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason  text,
  ADD COLUMN IF NOT EXISTS suspended_by      uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_profiles_suspended_at
  ON public.profiles (suspended_at) WHERE suspended_at IS NOT NULL;

COMMIT;
