-- Migration 0094: admin_undo_change — scoped, conflict-guarded one-click undo
-- for the six override entity types, plus internal per-type apply helpers.
--
-- Reversal semantics, by the recorded action:
--   update → write before_value's value columns back to the source row
--   create → delete the source row
--   delete → re-insert before_value
--
-- The undo writes through the SAME source tables, so the 0092 capture trigger
-- fires and records the undo ITSELF as a fresh admin_change_history row. We tag
-- that row via the app.change_note GUC ('undo of <history_id>') so the history
-- never loses an entry and the undo is itself auditable / re-undoable.
--
-- Two guard rails:
--   1. PRICING SAFETY — if entity_type is pricing_config/payout_tier_config AND
--      app_config.pricing_source = 'config', undo is BLOCKED (same philosophy as
--      the Config tab's reset guard: don't silently change live pricing/payout).
--   2. CONFLICT — if the source row has changed since this history entry was
--      recorded (current row ≠ this entry's after_value, or a row now exists at
--      a key we'd re-insert), the undo is REJECTED. This naturally limits undo
--      to the LATEST change of an entity; undoing an older entry would clobber a
--      newer edit.
--
-- Helpers are SECURITY DEFINER, REVOKE'd from PUBLIC, and never granted to
-- authenticated — only admin_undo_change (running as the same owner) calls them.

BEGIN;

-- ── Helper: current source row as jsonb (NULL if absent) ────────────────────
CREATE OR REPLACE FUNCTION public._admin_source_row(p_entity_type text, p_key jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r jsonb;
BEGIN
  IF p_entity_type = 'content_override' THEN
    SELECT to_jsonb(t) INTO r FROM public.content_overrides t
      WHERE t.app = p_key->>'app' AND t.locale = p_key->>'locale' AND t.key = p_key->>'key';
  ELSIF p_entity_type = 'branding' THEN
    SELECT to_jsonb(t) INTO r FROM public.app_branding t WHERE t.slug = p_key->>'slug';
  ELSIF p_entity_type = 'app_config' THEN
    SELECT to_jsonb(t) INTO r FROM public.app_config t WHERE t.key = p_key->>'key';
  ELSIF p_entity_type = 'pricing_config' THEN
    SELECT to_jsonb(t) INTO r FROM public.pricing_config t WHERE t.category = p_key->>'category';
  ELSIF p_entity_type = 'payout_tier_config' THEN
    SELECT to_jsonb(t) INTO r FROM public.payout_tier_config t WHERE t.tier = (p_key->>'tier')::int;
  ELSIF p_entity_type = 'design_override' THEN
    SELECT to_jsonb(t) INTO r FROM public.design_overrides t
      WHERE t.app = p_key->>'app' AND t.id = p_key->>'id' AND t.property = p_key->>'property';
  END IF;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public._admin_source_row(text, jsonb) FROM PUBLIC;

-- ── Helper: restore value columns from a snapshot (UPDATE) ───────────────────
CREATE OR REPLACE FUNCTION public._admin_update_source(p_entity_type text, p_snap jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_entity_type = 'content_override' THEN
    UPDATE public.content_overrides
       SET value = p_snap->>'value', updated_by = auth.uid(), updated_at = now()
     WHERE app = p_snap->>'app' AND locale = p_snap->>'locale' AND key = p_snap->>'key';
  ELSIF p_entity_type = 'branding' THEN
    UPDATE public.app_branding
       SET url = p_snap->>'url', updated_by = auth.uid(), updated_at = now()
     WHERE slug = p_snap->>'slug';
  ELSIF p_entity_type = 'app_config' THEN
    UPDATE public.app_config
       SET value = p_snap->'value', updated_by = auth.uid(), updated_at = now()
     WHERE key = p_snap->>'key';
  ELSIF p_entity_type = 'pricing_config' THEN
    UPDATE public.pricing_config
       SET consumer_price = (p_snap->>'consumer_price')::numeric,
           worker_price   = (p_snap->>'worker_price')::numeric,
           platform_fee   = (p_snap->>'platform_fee')::numeric,
           updated_by = auth.uid(), updated_at = now()
     WHERE category = p_snap->>'category';
  ELSIF p_entity_type = 'payout_tier_config' THEN
    UPDATE public.payout_tier_config
       SET payout = (p_snap->>'payout')::numeric, updated_by = auth.uid(), updated_at = now()
     WHERE tier = (p_snap->>'tier')::int;
  ELSIF p_entity_type = 'design_override' THEN
    UPDATE public.design_overrides
       SET value = p_snap->'value', updated_by = auth.uid(), updated_at = now()
     WHERE app = p_snap->>'app' AND id = p_snap->>'id' AND property = p_snap->>'property';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._admin_update_source(text, jsonb) FROM PUBLIC;

-- ── Helper: re-insert a previously-deleted row from a snapshot ───────────────
CREATE OR REPLACE FUNCTION public._admin_insert_source(p_entity_type text, p_snap jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_entity_type = 'content_override' THEN
    INSERT INTO public.content_overrides (app, locale, key, value, updated_by, updated_at)
    VALUES (p_snap->>'app', p_snap->>'locale', p_snap->>'key', p_snap->>'value', auth.uid(), now());
  ELSIF p_entity_type = 'branding' THEN
    INSERT INTO public.app_branding (slug, url, updated_by, updated_at)
    VALUES (p_snap->>'slug', p_snap->>'url', auth.uid(), now());
  ELSIF p_entity_type = 'app_config' THEN
    INSERT INTO public.app_config (key, value, value_type, updated_by, updated_at)
    VALUES (p_snap->>'key', p_snap->'value', p_snap->>'value_type', auth.uid(), now());
  ELSIF p_entity_type = 'pricing_config' THEN
    INSERT INTO public.pricing_config (category, consumer_price, worker_price, platform_fee, updated_by, updated_at)
    VALUES (p_snap->>'category', (p_snap->>'consumer_price')::numeric,
            (p_snap->>'worker_price')::numeric, (p_snap->>'platform_fee')::numeric, auth.uid(), now());
  ELSIF p_entity_type = 'payout_tier_config' THEN
    INSERT INTO public.payout_tier_config (tier, payout, updated_by, updated_at)
    VALUES ((p_snap->>'tier')::int, (p_snap->>'payout')::numeric, auth.uid(), now());
  ELSIF p_entity_type = 'design_override' THEN
    INSERT INTO public.design_overrides (app, id, property, value, updated_by, updated_at)
    VALUES (p_snap->>'app', p_snap->>'id', p_snap->>'property', p_snap->'value', auth.uid(), now());
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._admin_insert_source(text, jsonb) FROM PUBLIC;

-- ── Helper: delete the source row identified by a key snapshot ───────────────
CREATE OR REPLACE FUNCTION public._admin_delete_source(p_entity_type text, p_key jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_entity_type = 'content_override' THEN
    DELETE FROM public.content_overrides
      WHERE app = p_key->>'app' AND locale = p_key->>'locale' AND key = p_key->>'key';
  ELSIF p_entity_type = 'branding' THEN
    DELETE FROM public.app_branding WHERE slug = p_key->>'slug';
  ELSIF p_entity_type = 'app_config' THEN
    DELETE FROM public.app_config WHERE key = p_key->>'key';
  ELSIF p_entity_type = 'pricing_config' THEN
    DELETE FROM public.pricing_config WHERE category = p_key->>'category';
  ELSIF p_entity_type = 'payout_tier_config' THEN
    DELETE FROM public.payout_tier_config WHERE tier = (p_key->>'tier')::int;
  ELSIF p_entity_type = 'design_override' THEN
    DELETE FROM public.design_overrides
      WHERE app = p_key->>'app' AND id = p_key->>'id' AND property = p_key->>'property';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._admin_delete_source(text, jsonb) FROM PUBLIC;

-- ── The undo entry point ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_undo_change(p_history_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  h         public.admin_change_history%ROWTYPE;
  v_source  text;
  v_current jsonb;
  v_pk      jsonb;   -- snapshot carrying the PK columns (after for create/update, before for delete)
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;

  SELECT * INTO h FROM public.admin_change_history WHERE id = p_history_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'history entry not found'; END IF;

  IF h.entity_type NOT IN
     ('content_override','branding','app_config','pricing_config','payout_tier_config','design_override') THEN
    RAISE EXCEPTION 'this change is not reversible (entity_type=%)', h.entity_type;
  END IF;

  -- Guard 1: live pricing/payout undo is blocked while the source is 'config'.
  IF h.entity_type IN ('pricing_config','payout_tier_config') THEN
    v_source := public.get_config_text('pricing_source', 'hardcoded');
    IF v_source = 'config' THEN
      RAISE EXCEPTION
        'pricing_source is ''config'' — undoing live pricing/payout is blocked. Flip pricing_source to ''hardcoded'' first.';
    END IF;
  END IF;

  -- The PK columns live in whichever snapshot is non-null for this action.
  v_pk      := COALESCE(h.after_value, h.before_value);
  v_current := public._admin_source_row(h.entity_type, v_pk);

  -- Guard 2: conflict — refuse to clobber a newer edit.
  IF h.action IN ('create','update') THEN
    IF v_current IS DISTINCT FROM h.after_value THEN
      RAISE EXCEPTION 'conflict: this entity has been edited since (or already reverted); review before undoing';
    END IF;
  ELSIF h.action = 'delete' THEN
    IF v_current IS NOT NULL THEN
      RAISE EXCEPTION 'conflict: a row now exists at this key; review before undoing';
    END IF;
  END IF;

  -- Tag the history row that the source write below will generate.
  PERFORM set_config('app.change_note', 'undo of ' || p_history_id::text, true);

  IF h.action = 'create' THEN
    PERFORM public._admin_delete_source(h.entity_type, v_pk);
  ELSIF h.action = 'delete' THEN
    PERFORM public._admin_insert_source(h.entity_type, h.before_value);
  ELSE -- update
    PERFORM public._admin_update_source(h.entity_type, h.before_value);
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'entity_type',   h.entity_type,
    'entity_key',    h.entity_key,
    'reverted',      h.action,
    'restored_value', CASE WHEN h.action = 'create' THEN NULL ELSE h.before_value END
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_undo_change(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_undo_change(uuid) TO authenticated;

COMMIT;
