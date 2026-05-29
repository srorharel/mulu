-- Migration 0080: trigger_broadcast uses net.http_post (not pg_net.http_post).
--
-- pg_net is the EXTENSION name; its function symbols live in the `net`
-- schema. There is no `pg_net` schema. trigger_broadcast (0074) was written
-- calling `pg_net.http_post(...)` which fails at execution with
--   schema "pg_net" does not exist
-- notify_send (0046, since-patched by 0049) is correct — it calls
-- net.http_post and includes `net` in its SET search_path. This migration
-- mirrors that correction onto trigger_broadcast.
--
-- Per CLAUDE.md migration discipline: never edit applied migrations. DROP
-- FUNCTION IF EXISTS before CREATE OR REPLACE so the redeclaration succeeds
-- even if Postgres decides the new signature is "different" (it isn't, but
-- the DROP costs nothing here).

DROP FUNCTION IF EXISTS public.trigger_broadcast(uuid);

CREATE OR REPLACE FUNCTION public.trigger_broadcast(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
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

  -- Correct schema is `net`, not `pg_net`.
  PERFORM net.http_post(
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
