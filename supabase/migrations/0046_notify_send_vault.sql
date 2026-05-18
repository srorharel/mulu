-- ── Switch notify_send to read auth credentials from Supabase Vault ───────────
-- Replaces the current_setting('app.settings.*') approach, which requires
-- ALTER DATABASE superuser privileges not available in Supabase's managed
-- Postgres environment.
--
-- Prerequisites (one-time setup, already done):
--   The following secrets must exist in vault.secrets:
--     name = 'service_role_key'  → Supabase service role JWT
--     name = 'edge_function_url' → full URL to send-notification function
--   These were inserted via direct DB connection during setup (not in a
--   migration, since they contain sensitive values that must not be committed).
--
-- The security definer on this function allows it to read vault.decrypted_secrets
-- even though the trigger caller (authenticated role) cannot.

CREATE OR REPLACE FUNCTION public.notify_send(
  p_user_id   UUID,
  p_event     TEXT,
  p_data      JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
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

  PERFORM pg_net.http_post(
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
  RAISE WARNING 'notify_send: pg_net call failed (non-blocking): % — event=% user=%',
    SQLERRM, p_event, p_user_id;
END;
$$;
