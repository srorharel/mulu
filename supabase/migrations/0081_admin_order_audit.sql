-- Migration 0081: admin_order_audit table for P6 Live Jobs.
--
-- Every super_admin override on an order (force-status, reassignment, price
-- edit, photo replacement) writes a row here. The standard order_events
-- timeline records the *transition*; admin_order_audit records the *intent
-- and payload* so a human can later audit "why did this row change?".
--
-- RLS: super_admin reads + super_admin inserts. No agent/consumer/washer
-- access — admin overrides are not part of the support agent's normal scope.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_order_audit (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  admin_id    uuid        NOT NULL REFERENCES public.profiles(id),
  action      text        NOT NULL CHECK (action IN (
                            'force_status',
                            'reassign_washer',
                            'override_price',
                            'replace_photo',
                            'admin_create_order',
                            'cancel',
                            'force_complete'
                          )),
  reason      text,
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_order_audit_order
  ON public.admin_order_audit (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_order_audit_admin
  ON public.admin_order_audit (admin_id, created_at DESC);

ALTER TABLE public.admin_order_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_order_audit super_admin read"  ON public.admin_order_audit;
DROP POLICY IF EXISTS "admin_order_audit super_admin write" ON public.admin_order_audit;

CREATE POLICY "admin_order_audit super_admin read"
  ON public.admin_order_audit FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "admin_order_audit super_admin write"
  ON public.admin_order_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() AND admin_id = auth.uid());

-- Realtime — admin UI shows audit rows live without refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'admin_order_audit'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_order_audit;
  END IF;
END $$;

COMMIT;
