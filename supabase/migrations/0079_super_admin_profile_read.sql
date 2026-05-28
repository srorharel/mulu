-- Migration 0079: super_admin can read all profiles.
--
-- Required for the admin console's "Edited by <name>" metadata on the
-- Content / Branding / Config tabs. content_overrides.updated_by,
-- app_branding.updated_by, app_config.updated_by, pricing_config.updated_by
-- and payout_tier_config.updated_by all FK into public.profiles(id), but
-- the existing RLS only lets each user read their own profile row. This
-- policy is additive — it doesn't change main app / support-app behavior.

CREATE POLICY "super_admin reads all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_super_admin());
