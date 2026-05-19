-- ── Fix notify_send: pg_net schema is 'net', not 'pg_net' ────────────────────
--
-- Root cause: all prior versions of notify_send called `pg_net.http_post(...)`.
-- The pg_net extension installs its functions in the 'net' schema, not a schema
-- named 'pg_net'. The call therefore failed with "schema pg_net does not exist",
-- which was silently swallowed by the EXCEPTION WHEN OTHERS block, producing
-- zero entries in net._http_response and zero notification_log rows despite
-- real order transitions firing the trigger correctly.
--
-- Fix: replace pg_net.http_post with net.http_post. Add 'net' to search_path
-- so the call resolves without schema qualification as a secondary safeguard.

CREATE OR REPLACE FUNCTION public.notify_send(
  p_user_id   UUID,
  p_event     TEXT,
  p_data      JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
AS $$
DECLARE
  v_url  TEXT;
  v_key  TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'edge_function_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'notify_send: vault secrets edge_function_url or service_role_key not found — skipping';
    RETURN;
  END IF;

  -- Correct schema is 'net', not 'pg_net'
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object(
                 'user_id',    p_user_id,
                 'event_type', p_event,
                 'data',       p_data
               )
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_send: net.http_post call failed (non-blocking): % — event=% user=%',
    SQLERRM, p_event, p_user_id;
END;
$$;
