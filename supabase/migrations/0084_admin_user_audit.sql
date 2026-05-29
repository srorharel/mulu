-- Migration 0084: admin_user_audit table for P7 Users tab.
--
-- Mirrors admin_order_audit (0081): super_admin read + write, no anon. Every
-- admin profile edit, password reset, suspension, deletion, merge, or
-- impersonation issuance writes a row here with before/after snapshots so
-- destructive changes have a recoverable record.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_user_audit (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_id is the subject of the action. nullable because deletion removes
  -- the row from profiles, but we still want the audit history.
  user_id         uuid,
  admin_id        uuid        NOT NULL REFERENCES public.profiles(id),
  action          text        NOT NULL CHECK (action IN (
                                'update_profile',
                                'reset_password',
                                'suspend',
                                'unsuspend',
                                'delete_user',
                                'merge_users',
                                'impersonation_issued'
                              )),
  reason          text,
  before_snapshot jsonb,
  after_snapshot  jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_user_audit_user
  ON public.admin_user_audit (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_user_audit_admin
  ON public.admin_user_audit (admin_id, created_at DESC);

ALTER TABLE public.admin_user_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_user_audit super_admin read"  ON public.admin_user_audit;
DROP POLICY IF EXISTS "admin_user_audit super_admin write" ON public.admin_user_audit;

CREATE POLICY "admin_user_audit super_admin read"
  ON public.admin_user_audit FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "admin_user_audit super_admin write"
  ON public.admin_user_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() AND admin_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='admin_user_audit'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_user_audit;
  END IF;
END $$;

COMMIT;
