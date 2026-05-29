-- Migration 0091: allow service_role to call resolve_broadcast_segment.
--
-- The send-broadcast Edge Function loads broadcast rows + calls
-- resolve_broadcast_segment using the supabase-js client constructed with
-- the service_role JWT (TRIGGER_SECRET == service_role_key). That JWT has
-- no `sub` claim, so inside the RPC `auth.uid()` is NULL and the
-- `is_super_admin()` gate raises "super_admin required" — even though the
-- caller is in fact the trusted server path that trigger_broadcast already
-- gated on super_admin before pg_net.http_post'ing the Edge Function.
--
-- Without this, send-broadcast cannot resolve segments and every broadcast
-- silently fails with HTTP 500 (visible in net._http_response.content as
-- `{"error":"super_admin required"}`). The broadcast row stays sent_at=NULL,
-- sent_count=0, and the user gets no push notification.
--
-- Fix: accept either super_admin (interactive admin clients calling
-- preview / dry-run from the browser) OR service_role (the Edge Function
-- callback). All other roles still 401.
--
-- Migration discipline: DROP FUNCTION before CREATE OR REPLACE in case
-- the signature were ever to change; the RETURNS SETOF uuid shape stays
-- identical so the redeclaration is safe.

BEGIN;

DROP FUNCTION IF EXISTS public.resolve_broadcast_segment(uuid);

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
  v_jwt_role text;
BEGIN
  -- auth.role() reads request.jwt.claim.role; the service_role JWT
  -- (used by Edge Functions and other server-side callers) sets it to
  -- 'service_role'. coalesce so a non-PostgREST caller does not panic.
  v_jwt_role := coalesce(auth.role(), '');

  IF v_jwt_role <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'super_admin or service_role required';
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
GRANT EXECUTE ON FUNCTION public.resolve_broadcast_segment(uuid) TO authenticated, service_role;

COMMIT;
