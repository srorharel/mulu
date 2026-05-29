-- Migration 0089: admin_set_design_override RPC with bound validation.
--
-- Bounds (per ADR-027 / spec item P8 §9):
--   offset_x, offset_y    ∈ [-100, 100]
--   text_size             ∈ [0.7, 1.5]
--   border_radius         ∈ [0, 32]
--   padding               ∈ [0, 48]
--   color, bg             — any short hex/rgba string (length-limited)
--
-- A JSON CHECK constraint would be cleaner but Postgres JSONB CHECKs are
-- awkward when the keys are dynamic; doing this in PL/pgSQL keeps the
-- logic centralised and gives much better error messages.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_design_override(
  p_app      text,
  p_id       text,
  p_property text,
  p_value    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_num   numeric;
  v_str   text;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;
  IF p_app NOT IN ('main','support') THEN RAISE EXCEPTION 'invalid app: %', p_app; END IF;
  IF p_property NOT IN ('color','bg','text_size','padding','border_radius','offset_x','offset_y') THEN
    RAISE EXCEPTION 'invalid property: %', p_property;
  END IF;
  IF p_value IS NULL OR NOT (p_value ? 'value') THEN
    RAISE EXCEPTION 'value json must have a "value" key';
  END IF;

  -- Bound validation by property
  IF p_property IN ('offset_x','offset_y') THEN
    v_num := (p_value->>'value')::numeric;
    IF v_num < -100 OR v_num > 100 THEN
      RAISE EXCEPTION '% must be between -100 and 100', p_property;
    END IF;
  ELSIF p_property = 'text_size' THEN
    v_num := (p_value->>'value')::numeric;
    IF v_num < 0.7 OR v_num > 1.5 THEN
      RAISE EXCEPTION 'text_size must be between 0.7 and 1.5';
    END IF;
  ELSIF p_property = 'border_radius' THEN
    v_num := (p_value->>'value')::numeric;
    IF v_num < 0 OR v_num > 32 THEN
      RAISE EXCEPTION 'border_radius must be between 0 and 32';
    END IF;
  ELSIF p_property = 'padding' THEN
    v_num := (p_value->>'value')::numeric;
    IF v_num < 0 OR v_num > 48 THEN
      RAISE EXCEPTION 'padding must be between 0 and 48';
    END IF;
  ELSIF p_property IN ('color','bg') THEN
    v_str := p_value->>'value';
    IF length(coalesce(v_str, '')) = 0 OR length(v_str) > 32 THEN
      RAISE EXCEPTION '% must be a non-empty string of <=32 chars', p_property;
    END IF;
  END IF;

  INSERT INTO public.design_overrides (id, app, property, value, updated_by, updated_at)
  VALUES (p_id, p_app, p_property, p_value, v_admin, now())
  ON CONFLICT (app, id, property) DO UPDATE
    SET value      = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

  RETURN p_value;
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_set_design_override(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_design_override(text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_clear_design_override(
  p_app      text,
  p_id       text,
  p_property text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;
  DELETE FROM public.design_overrides
    WHERE app = p_app AND id = p_id AND property = p_property;
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_clear_design_override(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_clear_design_override(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_all_design_overrides()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;
  WITH d AS (DELETE FROM public.design_overrides RETURNING 1)
  SELECT count(*)::int INTO v_count FROM d;
  RETURN v_count;
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_reset_all_design_overrides() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_all_design_overrides() TO authenticated;

COMMIT;
