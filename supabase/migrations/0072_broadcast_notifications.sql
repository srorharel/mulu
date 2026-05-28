-- Migration 0072: broadcast_notifications + resolve_broadcast_segment RPC.
--
-- The admin console composes a broadcast (title/body in EN+HE, optional deep
-- link, target segment). send-broadcast Edge Function reads a row, resolves
-- its segment to a list of user_ids, and fans out via send-notification with
-- event_type='admin_broadcast'.
--
-- Segment types:
--   all_consumers    → every profile with role='consumer'
--   all_washers      → every profile with role='washer' (filter: tier_min, online)
--   all_agents       → every profile with role='agent'
--   single_user      → segment_payload.user_id
--   segment          → joined filter on segment_payload keys
--                      (role, tier_min, online, ordered_within_days, new_within_days)
--
-- RLS: super_admin only. No anon read — broadcast composition is internal,
-- and history is sensitive (who got messaged, when).

BEGIN;

CREATE TABLE IF NOT EXISTS public.broadcast_notifications (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en        text         NOT NULL,
  title_he        text         NOT NULL,
  body_en         text         NOT NULL,
  body_he         text         NOT NULL,
  deep_link_route text,
  segment_type    text         NOT NULL CHECK (segment_type IN (
                    'all_consumers','all_washers','all_agents','single_user','segment'
                  )),
  segment_payload jsonb        NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  sent_count      int          NOT NULL DEFAULT 0,
  failed_count    int          NOT NULL DEFAULT 0,
  created_by      uuid         REFERENCES public.profiles(id),
  created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_scheduled
  ON public.broadcast_notifications (scheduled_at)
  WHERE scheduled_at IS NOT NULL AND sent_at IS NULL;

ALTER TABLE public.broadcast_notifications ENABLE ROW LEVEL SECURITY;

-- super_admin only — composition + history are internal.
DROP POLICY IF EXISTS "broadcast_notifications super_admin all" ON public.broadcast_notifications;
CREATE POLICY "broadcast_notifications super_admin all"
  ON public.broadcast_notifications FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ── RPC: resolve_broadcast_segment ───────────────────────────────────────────
-- Returns the user_ids that match the broadcast's segment.
-- SECURITY DEFINER so it can read profiles + orders bypassing client RLS;
-- explicit is_super_admin() guard at the top.
CREATE OR REPLACE FUNCTION public.resolve_broadcast_segment(p_broadcast_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row      public.broadcast_notifications;
  v_role     text;
  v_tier_min int;
  v_online   boolean;
  v_ordered_within_days int;
  v_new_within_days     int;
  v_user_id  uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'super_admin required';
  END IF;

  SELECT * INTO v_row FROM public.broadcast_notifications WHERE id = p_broadcast_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'broadcast % not found', p_broadcast_id;
  END IF;

  CASE v_row.segment_type
    WHEN 'all_consumers' THEN
      RETURN QUERY SELECT id FROM public.profiles WHERE role = 'consumer';
    WHEN 'all_washers' THEN
      RETURN QUERY SELECT id FROM public.profiles WHERE role = 'washer';
    WHEN 'all_agents' THEN
      RETURN QUERY SELECT id FROM public.profiles WHERE role = 'agent';
    WHEN 'single_user' THEN
      v_user_id := (v_row.segment_payload->>'user_id')::uuid;
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'single_user segment missing user_id';
      END IF;
      RETURN QUERY SELECT v_user_id WHERE EXISTS (
        SELECT 1 FROM public.profiles WHERE id = v_user_id
      );
    WHEN 'segment' THEN
      v_role     := v_row.segment_payload->>'role';
      v_tier_min := nullif(v_row.segment_payload->>'tier_min','')::int;
      v_online   := nullif(v_row.segment_payload->>'online','')::boolean;
      v_ordered_within_days := nullif(v_row.segment_payload->>'ordered_within_days','')::int;
      v_new_within_days     := nullif(v_row.segment_payload->>'new_within_days','')::int;

      RETURN QUERY
        SELECT p.id
        FROM public.profiles p
        WHERE (v_role IS NULL OR p.role = v_role)
          AND (v_tier_min IS NULL OR (p.role = 'washer' AND p.current_tier >= v_tier_min))
          AND (v_online IS NULL OR p.is_online = v_online)
          AND (v_new_within_days IS NULL OR p.created_at > now() - make_interval(days => v_new_within_days))
          AND (v_ordered_within_days IS NULL OR EXISTS (
                SELECT 1 FROM public.orders o
                WHERE (o.consumer_id = p.id OR o.washer_id = p.id)
                  AND o.created_at > now() - make_interval(days => v_ordered_within_days)
          ));
    ELSE
      RAISE EXCEPTION 'unknown segment_type %', v_row.segment_type;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_broadcast_segment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_broadcast_segment(uuid) TO authenticated;

COMMIT;
