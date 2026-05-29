-- Migration 0095: support for best-effort user restore (the fragile one).
--
-- The actual recreation of the auth user happens in the admin-user-mgmt Edge
-- Function (action='restore_user') because only the service role can call
-- supabase.auth.admin.createUser(). This migration provides the two SQL-side
-- pieces that path needs:
--
--   1. Extends admin_user_audit.action CHECK to allow 'restore_user', so the
--      Edge Function can audit a restore (mirrors how 'delete_user' is logged).
--   2. admin_get_deletion_snapshot(p_audit_id) — super_admin-gated reader that
--      returns a deletion audit row's before_snapshot + the captured auth email
--      (if present), so the History UI can preview exactly what will be
--      restored and pre-fill the confirm-email step.
--
-- See ADR-028 for the full honesty discussion (new IDs, unreconnected
-- relational rows, etc.).

BEGIN;

-- ── 1. Allow the 'restore_user' audit action ────────────────────────────────
ALTER TABLE public.admin_user_audit DROP CONSTRAINT IF EXISTS admin_user_audit_action_check;
ALTER TABLE public.admin_user_audit ADD  CONSTRAINT admin_user_audit_action_check
  CHECK (action IN (
    'update_profile',
    'reset_password',
    'suspend',
    'unsuspend',
    'delete_user',
    'merge_users',
    'impersonation_issued',
    'restore_user'
  ));

-- ── 2. Deletion-snapshot reader for the restore preview ─────────────────────
-- Returns the most relevant 'delete_user' audit row's snapshot. before_snapshot
-- is the full profiles row at delete time; the Edge Function augments it with a
-- top-level "__auth" object ({ email }) on NEW deletes so the original email is
-- recoverable. Older deletes won't have "__auth" — the UI then requires the
-- admin to supply the email manually (it is not stored anywhere else once the
-- auth.users row is gone).

CREATE OR REPLACE FUNCTION public.admin_get_deletion_snapshot(p_audit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.admin_user_audit%ROWTYPE;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;

  SELECT * INTO v_row FROM public.admin_user_audit WHERE id = p_audit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'audit entry not found'; END IF;
  IF v_row.action <> 'delete_user' THEN
    RAISE EXCEPTION 'audit entry is not a user deletion (action=%)', v_row.action;
  END IF;

  RETURN jsonb_build_object(
    'audit_id',        v_row.id,
    'user_id',         v_row.user_id,
    'deleted_at',      v_row.created_at,
    'deleted_by',      v_row.admin_id,
    'profile',         v_row.before_snapshot,
    'auth_email',      v_row.before_snapshot->'__auth'->>'email',
    'already_restored', EXISTS (
      SELECT 1 FROM public.admin_user_audit r
       WHERE r.action = 'restore_user'
         AND r.before_snapshot->>'source_audit_id' = v_row.id::text
    )
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_get_deletion_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_deletion_snapshot(uuid) TO authenticated;

COMMIT;
