-- 0108_legal_update_fanout.sql
--
-- Push fan-out when a legal document is published. Mirrors the new-job-nearby
-- architecture (0053): an AFTER INSERT trigger on legal_documents fires ONE
-- pg_net call to the fan-out-legal-update Edge Function, which resolves the
-- audience and calls send-notification once per user. The trigger never loops
-- per-user, and a pg_net failure never aborts the publish.
--
-- Creates:
--   • legal_update_audience(doc_type)  — role-based + opt-in audience RPC
--   • notify_on_legal_publish()        — trigger fn (one net.http_post)
--   • trg_notify_on_legal_publish      — AFTER INSERT trigger, WHEN is_current
--
-- Prerequisites (run once after deployment — NOT in this migration, values are
-- environment-specific / sensitive):
--   INSERT vault secret 'fan_out_legal_update_url' =
--     'https://<project-ref>.supabase.co/functions/v1/fan-out-legal-update'
--   (TRIGGER_SECRET / service_role_key already set for the existing fan-outs.)
-- Until the Vault secret exists the trigger logs a warning and skips (no error).

-- ── 1. Audience RPC ───────────────────────────────────────────────────────────
-- consumer_terms → consumers; washer_terms → washers; privacy_policy → both.
-- Opt-in: excludes users whose notification_preferences.enabled = false (missing
-- row treated as enabled, matching the auto-insert default). send-notification
-- re-checks `enabled` per user, so this is a pre-filter, not the only gate.
-- Callable by the service-role Edge Function (auth.role()='service_role') or an
-- agent (preview); other roles are rejected.
drop function if exists public.legal_update_audience(text);
create function public.legal_update_audience(p_doc_type text)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_roles text[];
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_agent() then
    raise exception 'service_role or agent required';
  end if;

  if p_doc_type = 'consumer_terms' then
    v_roles := array['consumer'];
  elsif p_doc_type = 'washer_terms' then
    v_roles := array['washer'];
  elsif p_doc_type = 'privacy_policy' then
    v_roles := array['consumer','washer'];
  else
    raise exception 'invalid doc_type: %', p_doc_type;
  end if;

  return query
    select p.id
    from public.profiles p
    left join public.notification_preferences np on np.user_id = p.id
    where p.role = any(v_roles)
      and coalesce(np.enabled, true) = true;
end;
$$;

revoke all on function public.legal_update_audience(text) from public;
grant execute on function public.legal_update_audience(text) to authenticated, service_role;

-- ── 2. Trigger function — ONE pg_net call to the fan-out Edge Function ─────────
create or replace function public.notify_on_legal_publish()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'fan_out_legal_update_url' limit 1;

  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'service_role_key' limit 1;

  if v_url is null or v_key is null then
    raise warning 'notify_on_legal_publish: vault secrets fan_out_legal_update_url or service_role_key not found — skipping';
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('doc_type', new.doc_type, 'version', new.version)
  );

  return new;
exception when others then
  -- pg_net failure must never abort the publish INSERT
  raise warning 'notify_on_legal_publish: net.http_post failed (non-blocking): %', sqlerrm;
  return new;
end;
$$;

-- ── 3. Trigger on legal_documents INSERT (only when the new row is current) ────
drop trigger if exists trg_notify_on_legal_publish on public.legal_documents;
create trigger trg_notify_on_legal_publish
  after insert on public.legal_documents
  for each row
  when (new.is_current)
  execute function public.notify_on_legal_publish();

-- ── 4. Reload PostgREST schema cache ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
