-- Migration 0092: admin_change_history — unified before/after capture for the
-- four runtime-editable override surfaces (content / branding / config /
-- pricing / payout / design), so the admin History tab can show who-changed-
-- what AND offer a scoped one-click Undo.
--
-- WHY DB TRIGGERS (not JS in the admin app):
--   The override tables are written from several code paths — PostgREST from
--   the admin UI (content_overrides / app_branding / app_config /
--   pricing_config / payout_tier_config) AND SECURITY DEFINER RPCs
--   (admin_set_design_override) AND, in principle, raw SQL. Recording history
--   in the admin JS would miss every non-UI write and silently drift. AFTER
--   triggers capture OLD/NEW regardless of who wrote the row — nothing can
--   bypass them.
--
-- RLS SAFETY: the trigger function is SECURITY DEFINER owned by the migration
-- role (postgres). The six source tables are postgres-owned with no FORCE ROW
-- LEVEL SECURITY, so the trigger's INSERT into admin_change_history bypasses
-- RLS and can NEVER fail — even for writes where auth.uid() is NULL (a future
-- migration or seed touching app_config). changed_by is simply NULL in that
-- case. This is deliberate: history capture must never be able to roll back
-- the underlying edit.
--
-- Per the 0090 lesson, the super_admin SELECT policy is added IN THIS migration
-- (admin reads go through PostgREST with the user's JWT — a missing SELECT
-- policy = silently empty History tab, not an error).

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_change_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text        NOT NULL CHECK (entity_type IN (
                             'content_override','branding','app_config',
                             'pricing_config','payout_tier_config','design_override'
                           )),
  entity_key   text        NOT NULL,   -- composite key as text, e.g.
                                       --   content_override: 'main/he/consumer.home.bookCta'
                                       --   branding:         '<slug>'
                                       --   app_config:       '<key>'
                                       --   pricing_config:   '<category>'
                                       --   payout_tier:      '<tier>'
                                       --   design_override:  'main/<id>/<property>'
  action       text        NOT NULL CHECK (action IN ('create','update','delete')),
  before_value jsonb,                  -- full source row at the time (NULL on create)
  after_value  jsonb,                  -- full source row after the write (NULL on delete)
  note         text,                   -- e.g. 'undo of <history_id>' (set via the
                                       -- app.change_note GUC by admin_undo_change)
  changed_by   uuid        REFERENCES public.profiles(id),
  changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_change_history_changed_at
  ON public.admin_change_history (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_change_history_entity
  ON public.admin_change_history (entity_type, entity_key, changed_at DESC);

ALTER TABLE public.admin_change_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_change_history super_admin read"  ON public.admin_change_history;
DROP POLICY IF EXISTS "admin_change_history super_admin write" ON public.admin_change_history;

-- super_admin SELECT — required for the admin History tab's PostgREST reads.
CREATE POLICY "admin_change_history super_admin read"
  ON public.admin_change_history FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- super_admin INSERT — direct inserts are not expected (the trigger does the
-- writing as table owner, bypassing RLS), but we keep the policy for parity
-- with the other admin audit tables and for any future direct insert path.
CREATE POLICY "admin_change_history super_admin write"
  ON public.admin_change_history FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

-- Realtime — the History tab updates live as edits land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'admin_change_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_change_history;
  END IF;
END $$;

-- ── Capture trigger function ────────────────────────────────────────────────
-- One function fans out across all six override tables, keyed by TG_TABLE_NAME.
-- SECURITY DEFINER + `SET search_path = public` per the extensions lesson
-- (this function touches no extension, but we pin search_path explicitly).

CREATE OR REPLACE FUNCTION public.capture_admin_change_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_type text;
  v_entity_key  text;
  v_action      text;
  v_before      jsonb;
  v_after       jsonb;
  v_row         jsonb;   -- NEW (insert/update) else OLD (delete), for key building
BEGIN
  v_row := COALESCE(to_jsonb(NEW), to_jsonb(OLD));

  IF TG_TABLE_NAME = 'content_overrides' THEN
    v_entity_type := 'content_override';
    v_entity_key  := (v_row->>'app') || '/' || (v_row->>'locale') || '/' || (v_row->>'key');
  ELSIF TG_TABLE_NAME = 'app_branding' THEN
    v_entity_type := 'branding';
    v_entity_key  := v_row->>'slug';
  ELSIF TG_TABLE_NAME = 'app_config' THEN
    v_entity_type := 'app_config';
    v_entity_key  := v_row->>'key';
  ELSIF TG_TABLE_NAME = 'pricing_config' THEN
    v_entity_type := 'pricing_config';
    v_entity_key  := v_row->>'category';
  ELSIF TG_TABLE_NAME = 'payout_tier_config' THEN
    v_entity_type := 'payout_tier_config';
    v_entity_key  := v_row->>'tier';
  ELSIF TG_TABLE_NAME = 'design_overrides' THEN
    v_entity_type := 'design_override';
    v_entity_key  := (v_row->>'app') || '/' || (v_row->>'id') || '/' || (v_row->>'property');
  ELSE
    RETURN NULL;   -- never happens; only the six tables get this trigger
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_before := NULL;
    v_after  := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    -- A genuinely no-op UPDATE (identical row, e.g. UI re-save of an unchanged
    -- value with the same updated_at) need not pollute the history.
    IF v_before = v_after THEN RETURN NULL; END IF;
  ELSE -- DELETE
    v_action := 'delete';
    v_before := to_jsonb(OLD);
    v_after  := NULL;
  END IF;

  INSERT INTO public.admin_change_history
    (entity_type, entity_key, action, before_value, after_value, note, changed_by)
  VALUES
    (v_entity_type, v_entity_key, v_action, v_before, v_after,
     NULLIF(current_setting('app.change_note', true), ''),  -- set by admin_undo_change
     auth.uid());

  RETURN NULL;  -- AFTER trigger — return value is ignored
END;
$$;

-- ── Attach the trigger to all six override tables ───────────────────────────

DROP TRIGGER IF EXISTS trg_history_content_overrides  ON public.content_overrides;
CREATE TRIGGER trg_history_content_overrides
  AFTER INSERT OR UPDATE OR DELETE ON public.content_overrides
  FOR EACH ROW EXECUTE FUNCTION public.capture_admin_change_history();

DROP TRIGGER IF EXISTS trg_history_app_branding ON public.app_branding;
CREATE TRIGGER trg_history_app_branding
  AFTER INSERT OR UPDATE OR DELETE ON public.app_branding
  FOR EACH ROW EXECUTE FUNCTION public.capture_admin_change_history();

DROP TRIGGER IF EXISTS trg_history_app_config ON public.app_config;
CREATE TRIGGER trg_history_app_config
  AFTER INSERT OR UPDATE OR DELETE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.capture_admin_change_history();

DROP TRIGGER IF EXISTS trg_history_pricing_config ON public.pricing_config;
CREATE TRIGGER trg_history_pricing_config
  AFTER INSERT OR UPDATE OR DELETE ON public.pricing_config
  FOR EACH ROW EXECUTE FUNCTION public.capture_admin_change_history();

DROP TRIGGER IF EXISTS trg_history_payout_tier_config ON public.payout_tier_config;
CREATE TRIGGER trg_history_payout_tier_config
  AFTER INSERT OR UPDATE OR DELETE ON public.payout_tier_config
  FOR EACH ROW EXECUTE FUNCTION public.capture_admin_change_history();

DROP TRIGGER IF EXISTS trg_history_design_overrides ON public.design_overrides;
CREATE TRIGGER trg_history_design_overrides
  AFTER INSERT OR UPDATE OR DELETE ON public.design_overrides
  FOR EACH ROW EXECUTE FUNCTION public.capture_admin_change_history();

COMMIT;
