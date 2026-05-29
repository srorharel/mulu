-- Migration 0087: impersonation tokens for the admin "open main app as user" flow.
--
-- Flow:
--   1. super_admin calls admin_create_impersonation_token(target, ttl) →
--      returns a fresh random token. We store the SHA-256 hash; the plain
--      token never lands in the DB.
--   2. admin opens main app at  /?impersonate_token=<plain>
--   3. main app posts to the `impersonate-redeem` Edge Function (next phase)
--   4. function hashes the token, looks up the row, validates expires_at,
--      marks used_at = now() atomically (UPDATE … WHERE used_at IS NULL),
--      generates a Supabase auth session for the target via auth.admin.*,
--      returns the session JSON. Single-use.
--
-- This migration only sets up the table + the issuance RPC. The redeem
-- function lives in supabase/functions/impersonate-redeem.

BEGIN;

CREATE TABLE IF NOT EXISTS public.impersonation_tokens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      text        NOT NULL UNIQUE,         -- sha256 hex
  target_user_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_id        uuid        NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_impersonation_tokens_target
  ON public.impersonation_tokens (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_tokens_unused
  ON public.impersonation_tokens (expires_at) WHERE used_at IS NULL;

ALTER TABLE public.impersonation_tokens ENABLE ROW LEVEL SECURITY;
-- No anon access; the Edge Function uses the service-role client.
-- Super-admin can read the audit metadata (everything except the token hash
-- is useful for diagnosing "did the user redeem yet?").
DROP POLICY IF EXISTS "impersonation_tokens super_admin read" ON public.impersonation_tokens;
CREATE POLICY "impersonation_tokens super_admin read"
  ON public.impersonation_tokens FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- ── Issuance RPC ────────────────────────────────────────────────────────────
-- Returns the plain-text token to the caller exactly once. The token is
-- 32 random bytes hex-encoded (64 chars). The hash + metadata persist.
--
-- The plain token must travel out-of-band to the user's browser (here: as a
-- URL param). It is single-use and expires fast.

CREATE OR REPLACE FUNCTION public.admin_create_impersonation_token(
  p_target_user_id uuid,
  p_ttl_seconds    int DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_token text;
  v_hash  text;
  v_target_role text;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;
  IF p_ttl_seconds < 30 OR p_ttl_seconds > 3600 THEN
    RAISE EXCEPTION 'ttl must be between 30 and 3600 seconds';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_target_user_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
  IF v_target_role = 'super_admin' THEN
    RAISE EXCEPTION 'cannot impersonate another super_admin';
  END IF;

  -- 32 bytes → hex string (64 chars). Hash with sha256 → 64 hex chars.
  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash  := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.impersonation_tokens (token_hash, target_user_id, admin_id, expires_at)
  VALUES (v_hash, p_target_user_id, v_admin, now() + make_interval(secs => p_ttl_seconds));

  INSERT INTO public.admin_user_audit (user_id, admin_id, action, reason)
  VALUES (p_target_user_id, v_admin, 'impersonation_issued',
          'token issued for ' || p_ttl_seconds || 's');

  RETURN jsonb_build_object(
    'token',       v_token,
    'target_user', p_target_user_id,
    'expires_at',  now() + make_interval(secs => p_ttl_seconds)
  );
END;
$$;

-- pgcrypto provides digest() and gen_random_bytes(). Already enabled by
-- previous migrations on this Supabase project (e.g. 0001 uses
-- gen_random_uuid via uuid-ossp; pgcrypto is bundled with Supabase by
-- default). If a future re-deploy ever needs to bootstrap from scratch on a
-- DB without pgcrypto, add CREATE EXTENSION IF NOT EXISTS pgcrypto here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
END $$;

REVOKE ALL  ON FUNCTION public.admin_create_impersonation_token(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_impersonation_token(uuid, int) TO authenticated;

COMMIT;
