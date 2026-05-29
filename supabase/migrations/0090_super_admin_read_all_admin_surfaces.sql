-- Migration 0090: super_admin SELECT policies for every table the admin app reads.
--
-- Discovered by smoke-p6-p7-p8.js: P6/P7 RPCs were SECURITY DEFINER so the
-- writes worked, but the admin app's read queries (`fetchJobs`, `fetchUsers`,
-- detail panels reading orders/vehicles/ratings/etc.) all run via Supabase
-- with the user's JWT, so they need an RLS SELECT policy for super_admin.
--
-- 0079 added the super_admin SELECT policy for `profiles` (so editor names
-- could resolve). Every other table the admin reads was missing one.
--
-- Also fixes admin_create_impersonation_token: pgcrypto lives in the
-- `extensions` schema (Supabase default), not `public`. The function's
-- search_path was `public, pg_temp`, so unqualified gen_random_bytes/digest
-- calls failed. Schema-qualify them and add `extensions` to the path.

BEGIN;

-- ── 1. super_admin SELECT policies on every admin-readable table ────────────
--
-- These are ADDITIVE — the existing consumer/washer/agent policies still
-- apply. PostgreSQL OR-combines policies of the same command, so a row is
-- visible if ANY applicable policy permits.

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'orders', 'order_events', 'order_messages',
    'vehicles', 'washer_ratings', 'washer_verifications',
    'support_conversations', 'support_messages', 'support_tickets',
    'support_canned_responses', 'approval_audit',
    'notification_log', 'device_tokens', 'notification_preferences',
    'order_washer_notifications', 'broadcast_notifications'
  ];
  v_t text;
  v_pol text;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    -- Skip tables that don't exist in this DB (defensive — none should be missing)
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_t
    ) THEN
      RAISE NOTICE 'skipping %: table not found', v_t;
      CONTINUE;
    END IF;

    v_pol := format('super_admin reads all %s', v_t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol, v_t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_super_admin())',
      v_pol, v_t
    );
  END LOOP;
END $$;

-- ── 2. Fix admin_create_impersonation_token: pgcrypto schema-qualified ──────
--
-- pgcrypto is installed in `extensions` (Supabase convention). Two fixes:
--   (a) Add `extensions` to search_path so unqualified calls resolve, AND
--   (b) Schema-qualify the calls themselves — belt-and-suspenders, makes the
--       function robust if someone moves the extension later.

CREATE OR REPLACE FUNCTION public.admin_create_impersonation_token(
  p_target_user_id uuid,
  p_ttl_seconds    int DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
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

  -- Schema-qualify pgcrypto symbols so this function works regardless of
  -- whether `extensions` is on search_path (defensive — Supabase installs
  -- pgcrypto in extensions; some self-hosted Postgres setups put it in public).
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

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

REVOKE ALL  ON FUNCTION public.admin_create_impersonation_token(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_impersonation_token(uuid, int) TO authenticated;

COMMIT;
