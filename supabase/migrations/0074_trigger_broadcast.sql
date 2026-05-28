-- Migration 0074: trigger_broadcast RPC.
--
-- The admin app composes a broadcast (insert into broadcast_notifications)
-- and then calls supabase.rpc('trigger_broadcast', { p_broadcast_id }) to
-- kick off send-broadcast. This RPC is the equivalent of notify_send() for
-- broadcasts — it reads service_role_key from vault and pg_net.http_posts
-- to the Edge Function, which the client cannot do directly (the Edge Fn
-- requires TRIGGER_SECRET in the Authorization header).
--
-- The send-broadcast URL is derived from the existing edge_function_url
-- vault secret (which points at send-notification) — no second vault entry
-- to set up.

CREATE OR REPLACE FUNCTION public.trigger_broadcast(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_send_notif_url text;
  v_send_bcast_url text;
  v_key            text;
  v_row            public.broadcast_notifications;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'super_admin required';
  END IF;

  SELECT * INTO v_row FROM public.broadcast_notifications WHERE id = p_broadcast_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'broadcast % not found', p_broadcast_id;
  END IF;
  IF v_row.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'broadcast % already sent at %', p_broadcast_id, v_row.sent_at;
  END IF;

  SELECT decrypted_secret INTO v_send_notif_url FROM vault.decrypted_secrets
   WHERE name = 'edge_function_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets
   WHERE name = 'service_role_key' LIMIT 1;

  IF v_send_notif_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'vault secrets edge_function_url or service_role_key missing';
  END IF;

  v_send_bcast_url := regexp_replace(v_send_notif_url, '/send-notification$', '/send-broadcast');

  PERFORM pg_net.http_post(
    url     := v_send_bcast_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('broadcast_id', p_broadcast_id)
  );

  RETURN jsonb_build_object('ok', true, 'broadcast_id', p_broadcast_id);
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_broadcast(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_broadcast(uuid) TO authenticated;
