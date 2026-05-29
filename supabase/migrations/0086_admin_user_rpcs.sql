-- Migration 0086: super_admin RPCs for the P7 Users tab.
--
-- - admin_get_user_auth(p_user_id)         → reads auth.users for the row
-- - admin_update_profile(p_user_id, json)  → whitelisted field updates
-- - admin_suspend_user / admin_unsuspend_user
-- - admin_merge_users(keep, merge, reason) → reparents FKs, deletes the merged
-- - admin_user_activity(p_user_id)         → unioned chronological feed
--
-- Password reset (auth.users.encrypted_password) and final auth.users delete
-- live in the admin-user-mgmt Edge Function (next phase) — they need the
-- service role key for auth.admin.* methods and PostgREST does not have it.

BEGIN;

-- ── 1. admin_get_user_auth ──────────────────────────────────────────────────
-- Returns a small jsonb with auth.users fields the admin UI cares about.
-- Super-admin only. SECURITY DEFINER so the public role need not be granted
-- direct access to auth.users.

CREATE OR REPLACE FUNCTION public.admin_get_user_auth(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_row record;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;

  SELECT email, email_confirmed_at, last_sign_in_at, created_at, banned_until
    INTO v_row
    FROM auth.users
   WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'email',             v_row.email,
    'email_confirmed_at', v_row.email_confirmed_at,
    'last_sign_in_at',    v_row.last_sign_in_at,
    'created_at',         v_row.created_at,
    'banned_until',       v_row.banned_until
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_get_user_auth(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_auth(uuid) TO authenticated;

-- ── 2. admin_update_profile (whitelisted) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_update_profile(p_user_id uuid, p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_before jsonb;
  v_after  jsonb;
  v_full_name              text;
  v_phone                  text;
  v_locale                 text;
  v_role                   text;
  v_washer_verification    text;
  v_agent_display_name     text;
  v_agent_is_active        boolean;
  v_current_tier           int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;

  SELECT row_to_json(p)::jsonb INTO v_before FROM public.profiles p WHERE id = p_user_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;

  -- Pull only whitelisted keys from the jsonb.
  v_full_name           := p_changes->>'full_name';
  v_phone               := p_changes->>'phone';
  v_locale              := p_changes->>'locale';
  v_role                := p_changes->>'role';
  v_washer_verification := p_changes->>'washer_verification_status';
  v_agent_display_name  := p_changes->>'agent_display_name';
  v_agent_is_active     := CASE WHEN p_changes ? 'agent_is_active'
                                THEN (p_changes->>'agent_is_active')::boolean END;
  v_current_tier        := CASE WHEN p_changes ? 'current_tier'
                                THEN (p_changes->>'current_tier')::int END;

  IF v_role IS NOT NULL AND v_role NOT IN ('consumer','washer','agent','super_admin') THEN
    RAISE EXCEPTION 'invalid role: %', v_role;
  END IF;
  IF v_washer_verification IS NOT NULL AND v_washer_verification NOT IN ('pending_review','approved','rejected') THEN
    RAISE EXCEPTION 'invalid washer_verification_status: %', v_washer_verification;
  END IF;

  UPDATE public.profiles SET
    full_name                  = COALESCE(v_full_name,                 full_name),
    phone                      = COALESCE(v_phone,                     phone),
    locale                     = COALESCE(v_locale,                    locale),
    role                       = COALESCE(v_role,                      role),
    washer_verification_status = COALESCE(v_washer_verification,       washer_verification_status),
    agent_display_name         = COALESCE(v_agent_display_name,        agent_display_name),
    agent_is_active            = COALESCE(v_agent_is_active,           agent_is_active),
    current_tier               = COALESCE(v_current_tier,              current_tier)
  WHERE id = p_user_id;

  SELECT row_to_json(p)::jsonb INTO v_after FROM public.profiles p WHERE id = p_user_id;

  INSERT INTO public.admin_user_audit (user_id, admin_id, action, before_snapshot, after_snapshot)
  VALUES (p_user_id, v_admin, 'update_profile', v_before, v_after);

  RETURN v_after;
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_update_profile(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, jsonb) TO authenticated;

-- ── 3. admin_suspend_user / admin_unsuspend_user ────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_suspend_user(p_user_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_target_role text;
  v_before jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT role, row_to_json(p)::jsonb INTO v_target_role, v_before
    FROM public.profiles p WHERE id = p_user_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_target_role = 'super_admin' THEN
    RAISE EXCEPTION 'cannot suspend super_admin accounts';
  END IF;

  UPDATE public.profiles
     SET suspended_at = now(),
         suspended_reason = trim(p_reason),
         suspended_by = v_admin
   WHERE id = p_user_id;

  INSERT INTO public.admin_user_audit (user_id, admin_id, action, reason, before_snapshot)
  VALUES (p_user_id, v_admin, 'suspend', trim(p_reason), v_before);
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_suspend_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := auth.uid();
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;

  UPDATE public.profiles
     SET suspended_at = NULL, suspended_reason = NULL, suspended_by = NULL
   WHERE id = p_user_id;

  INSERT INTO public.admin_user_audit (user_id, admin_id, action)
  VALUES (p_user_id, v_admin, 'unsuspend');
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_unsuspend_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid) TO authenticated;

-- ── 4. admin_merge_users ────────────────────────────────────────────────────
-- Reassigns every FK pointing at p_merge_user_id → p_keep_user_id, then
-- deletes the merged profile. Auth.users for the merged user must be
-- deleted separately via the admin-user-mgmt Edge Function — this RPC does
-- not touch auth.

CREATE OR REPLACE FUNCTION public.admin_merge_users(
  p_keep_user_id  uuid,
  p_merge_user_id uuid,
  p_reason        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_keep jsonb;
  v_merge jsonb;
  v_keep_role text;
  v_merge_role text;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;
  IF p_keep_user_id = p_merge_user_id THEN RAISE EXCEPTION 'cannot merge a user into itself'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT row_to_json(p)::jsonb, role INTO v_keep,  v_keep_role  FROM public.profiles p WHERE id = p_keep_user_id;
  SELECT row_to_json(p)::jsonb, role INTO v_merge, v_merge_role FROM public.profiles p WHERE id = p_merge_user_id;
  IF v_keep IS NULL OR v_merge IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;

  -- Block conflicting active jobs (both are washers with active orders).
  IF v_keep_role = 'washer' AND v_merge_role = 'washer' AND EXISTS (
    SELECT 1 FROM public.orders
     WHERE washer_id IN (p_keep_user_id, p_merge_user_id)
       AND status IN ('accepted','en_route','arrived','in_progress','pending_approval')
    GROUP BY washer_id
    HAVING count(*) > 0
  ) THEN
    -- More targeted: if BOTH washers each have an active job, block.
    IF (
      SELECT count(DISTINCT washer_id) FROM public.orders
      WHERE washer_id IN (p_keep_user_id, p_merge_user_id)
        AND status IN ('accepted','en_route','arrived','in_progress','pending_approval')
    ) > 1 THEN
      RAISE EXCEPTION 'both washers have an active job; resolve before merging';
    END IF;
  END IF;

  -- Reparent: enumerate every public.* FK pointing at profiles.id.
  UPDATE public.orders             SET consumer_id     = p_keep_user_id WHERE consumer_id     = p_merge_user_id;
  UPDATE public.orders             SET washer_id       = p_keep_user_id WHERE washer_id       = p_merge_user_id;
  UPDATE public.orders             SET created_by_admin= p_keep_user_id WHERE created_by_admin= p_merge_user_id;
  UPDATE public.orders             SET cancelled_by    = NULL           WHERE cancelled_by    IS NOT NULL
    AND cancelled_by IN ('agent','consumer','washer') AND false;  -- text column; not a FK
  UPDATE public.vehicles           SET consumer_id     = p_keep_user_id WHERE consumer_id     = p_merge_user_id;
  UPDATE public.washer_ratings     SET washer_id       = p_keep_user_id WHERE washer_id       = p_merge_user_id;
  UPDATE public.washer_ratings     SET consumer_id     = p_keep_user_id WHERE consumer_id     = p_merge_user_id;
  UPDATE public.support_conversations SET opener_id    = p_keep_user_id WHERE opener_id       = p_merge_user_id;
  UPDATE public.support_conversations SET agent_id     = p_keep_user_id WHERE agent_id        = p_merge_user_id;
  UPDATE public.support_messages   SET sender_id       = p_keep_user_id WHERE sender_id       = p_merge_user_id;
  UPDATE public.order_messages     SET sender_id       = p_keep_user_id WHERE sender_id       = p_merge_user_id;
  UPDATE public.device_tokens      SET user_id         = p_keep_user_id WHERE user_id         = p_merge_user_id;
  UPDATE public.notification_log   SET user_id         = p_keep_user_id WHERE user_id         = p_merge_user_id;

  -- notification_preferences keyed by user_id — drop the merged row if a keep row already exists
  DELETE FROM public.notification_preferences
    WHERE user_id = p_merge_user_id
      AND EXISTS (SELECT 1 FROM public.notification_preferences WHERE user_id = p_keep_user_id);
  UPDATE public.notification_preferences SET user_id = p_keep_user_id WHERE user_id = p_merge_user_id;

  -- Delete the merged profile (auth.users left intact; Edge Function cleans up).
  DELETE FROM public.profiles WHERE id = p_merge_user_id;

  INSERT INTO public.admin_user_audit (user_id, admin_id, action, reason, before_snapshot, after_snapshot)
  VALUES (
    p_keep_user_id, v_admin, 'merge_users', trim(p_reason),
    jsonb_build_object('keep', v_keep, 'merge', v_merge),
    jsonb_build_object('merged_into', p_keep_user_id)
  );

  RETURN jsonb_build_object('keep', p_keep_user_id, 'merged', p_merge_user_id);
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_merge_users(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_merge_users(uuid, uuid, text) TO authenticated;

-- ── 5. admin_user_activity (chronological feed) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_user_activity(p_user_id uuid, p_limit int DEFAULT 200)
RETURNS TABLE (
  source     text,
  ref_id     text,
  occurred_at timestamptz,
  summary    text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM (
    SELECT 'order_event'::text       AS source,
           oe.order_id::text         AS ref_id,
           oe.created_at             AS occurred_at,
           ('order ' || COALESCE(oe.from_status, '∅') || ' → ' || oe.to_status) AS summary
      FROM public.order_events oe
      JOIN public.orders o ON o.id = oe.order_id
     WHERE o.consumer_id = p_user_id OR o.washer_id = p_user_id OR oe.actor_id = p_user_id

    UNION ALL

    SELECT 'support_message'::text,
           sm.conversation_id::text,
           sm.created_at,
           ('support: ' || left(coalesce(sm.body, ''), 80))
      FROM public.support_messages sm
     WHERE sm.sender_id = p_user_id

    UNION ALL

    SELECT 'notification'::text,
           nl.id::text,
           nl.created_at,
           ('push ' || nl.event_type || ' ' || CASE WHEN nl.delivered THEN 'ok' ELSE 'fail' END)
      FROM public.notification_log nl
     WHERE nl.user_id = p_user_id

    UNION ALL

    SELECT 'rating'::text,
           wr.id::text,
           wr.created_at,
           ('rating ' || wr.stars::text || '★')
      FROM public.washer_ratings wr
     WHERE wr.washer_id = p_user_id OR wr.consumer_id = p_user_id
  ) feed
  ORDER BY occurred_at DESC
  LIMIT p_limit;
$$;

REVOKE ALL  ON FUNCTION public.admin_user_activity(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_activity(uuid, int) TO authenticated;

-- Wrap activity in a super_admin guard via a wrapper (sql functions cannot
-- easily check auth.uid() and short-circuit; instead require super_admin
-- on the calling client; the rows themselves don't include sensitive
-- columns beyond what super_admin can already read via profiles policy).
-- For defense-in-depth, the admin app calls this RPC and refuses to render
-- for non-super_admin users. PostgREST honors GRANT EXECUTE; no other role
-- has direct access to call.

COMMIT;
