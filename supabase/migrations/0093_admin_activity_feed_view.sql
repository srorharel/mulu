-- Migration 0093: admin_activity_feed — one chronological, normalized view over
-- every admin audit source, plus a super_admin-gated paginated reader RPC.
--
-- UNION ALL of four sources:
--   admin_change_history    (0092 — override edits, undoable)
--   admin_order_audit       (0081 — P6 Live Jobs actions)
--   admin_user_audit        (0084 — P7 user actions)
--   broadcast_notifications (0072 — each SENT broadcast as a history entry)
--
-- `undoable` is computed per the scoped-undo policy: TRUE only for the override
-- edits (admin_change_history); everything else is FALSE. The History UI keys
-- the best-effort "Restore" button off (source_table='admin_user_audit' AND
-- action='delete_user') separately — that is NOT one-click undoable.
--
-- SECURITY: the view is a security-definer view (owner = postgres). Querying it
-- directly would bypass RLS on the underlying audit tables, so SELECT is
-- REVOKED from anon/authenticated/PUBLIC. The ONLY read path is
-- get_admin_activity_feed(), which is SECURITY DEFINER and gates on
-- is_super_admin() at the top (a view alone can't enforce super_admin cleanly
-- across four differently-owned tables).

BEGIN;

CREATE OR REPLACE VIEW public.admin_activity_feed AS

  -- 1. Override edits (content / branding / config / pricing / payout / design)
  SELECT
    'admin_change_history'::text                          AS source_table,
    h.id                                                  AS ref_id,
    h.entity_type                                         AS entity_type,
    CASE h.entity_type
      WHEN 'content_override'   THEN 'content'
      WHEN 'branding'           THEN 'branding'
      WHEN 'app_config'         THEN 'config'
      WHEN 'pricing_config'     THEN 'config'
      WHEN 'payout_tier_config' THEN 'config'
      WHEN 'design_override'    THEN 'design'
    END                                                   AS category,
    h.entity_key                                          AS entity_label,
    h.action                                              AS action,
    h.changed_by                                          AS actor_id,
    pr.full_name                                          AS actor_name,
    h.note                                                AS reason,
    h.before_value                                        AS before_value,
    h.after_value                                         AS after_value,
    h.changed_at                                          AS occurred_at,
    true                                                  AS undoable
  FROM public.admin_change_history h
  LEFT JOIN public.profiles pr ON pr.id = h.changed_by

  UNION ALL

  -- 2. P6 Live Jobs admin actions
  SELECT
    'admin_order_audit'::text,
    oa.id,
    'order'::text,
    'orders'::text,
    'Order ' || left(oa.order_id::text, 8),
    oa.action,
    oa.admin_id,
    pr.full_name,
    oa.reason,
    NULL::jsonb,
    oa.payload,
    oa.created_at,
    false
  FROM public.admin_order_audit oa
  LEFT JOIN public.profiles pr ON pr.id = oa.admin_id

  UNION ALL

  -- 3. P7 user actions
  SELECT
    'admin_user_audit'::text,
    ua.id,
    'user'::text,
    'users'::text,
    'User ' || COALESCE(tp.full_name, ua.before_snapshot->>'full_name', left(ua.user_id::text, 8), 'unknown'),
    ua.action,
    ua.admin_id,
    pr.full_name,
    ua.reason,
    ua.before_snapshot,
    ua.after_snapshot,
    ua.created_at,
    false
  FROM public.admin_user_audit ua
  LEFT JOIN public.profiles pr ON pr.id = ua.admin_id
  LEFT JOIN public.profiles tp ON tp.id = ua.user_id

  UNION ALL

  -- 4. Sent broadcasts (one entry per delivery)
  SELECT
    'broadcast_notifications'::text,
    b.id,
    'broadcast'::text,
    'broadcasts'::text,
    COALESCE(NULLIF(b.title_en, ''), b.title_he, 'Broadcast'),
    'sent'::text,
    b.created_by,
    pr.full_name,
    ('Sent to ' || b.sent_count || ' recipients'
       || CASE WHEN b.failed_count > 0 THEN ' (' || b.failed_count || ' failed)' ELSE '' END),
    NULL::jsonb,
    jsonb_build_object(
      'title_en', b.title_en, 'title_he', b.title_he,
      'body_en',  b.body_en,  'body_he',  b.body_he,
      'segment_type', b.segment_type, 'segment_payload', b.segment_payload,
      'sent_count', b.sent_count, 'failed_count', b.failed_count,
      'deep_link_route', b.deep_link_route
    ),
    b.sent_at,
    false
  FROM public.broadcast_notifications b
  LEFT JOIN public.profiles pr ON pr.id = b.created_by
  WHERE b.sent_at IS NOT NULL;

-- Lock down direct access — the view is the building block, the RPC is the gate.
REVOKE ALL ON public.admin_activity_feed FROM PUBLIC;
REVOKE ALL ON public.admin_activity_feed FROM anon;
REVOKE ALL ON public.admin_activity_feed FROM authenticated;

-- ── Paginated, filtered, super_admin-gated reader ───────────────────────────
-- p_before    : keyset cursor — return rows strictly older than this timestamp
-- p_entity_type: 'all'/NULL = everything; otherwise matches the coarse category
--                ('content','branding','config','design','orders','users',
--                'broadcasts') OR a fine entity_type ('content_override', …).

CREATE OR REPLACE FUNCTION public.get_admin_activity_feed(
  p_limit       int         DEFAULT 50,
  p_before      timestamptz DEFAULT NULL,
  p_entity_type text        DEFAULT NULL
)
RETURNS SETOF public.admin_activity_feed
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'super_admin required'; END IF;

  RETURN QUERY
    SELECT *
    FROM public.admin_activity_feed f
    WHERE (p_before IS NULL OR f.occurred_at < p_before)
      AND (p_entity_type IS NULL
           OR p_entity_type = 'all'
           OR f.category    = p_entity_type
           OR f.entity_type = p_entity_type)
    ORDER BY f.occurred_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END;
$$;

REVOKE ALL  ON FUNCTION public.get_admin_activity_feed(int, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_activity_feed(int, timestamptz, text) TO authenticated;

COMMIT;
