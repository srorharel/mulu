-- Migration 0125: pre-signup email availability probe.
--
-- Registration must reject an email already attached to an account with a clean
-- "email already in use" message. Supabase's email-enumeration protection makes
-- this impossible to detect from auth.signUp() on the client:
--
--   * With protection ON, signUp does NOT error on a duplicate — it returns a
--     200 with an obfuscated user (identities: []). On @supabase/auth-js >= 2.x
--     the client's _sessionResponse collapses that body to { user: null,
--     session: null }, which is INDISTINGUISHABLE from a fresh "check your email"
--     signup. So the form used to show the verification screen for a duplicate.
--
-- Fix mirrors phone_available (0124): a SECURITY DEFINER boolean the signup form
-- calls BEFORE auth.signUp, surfacing a clean inline message. Email lives only in
-- auth.users (profiles has no email column — see 0062), so the function reads
-- auth.users; SECURITY DEFINER (owner postgres) can, and the schema is qualified
-- so it never depends on the caller's search_path. Compared case-insensitively
-- and trimmed, matching how Supabase normalises emails. Soft-deleted/anonymized
-- rows (deleted_at) are ignored — that address is free to re-register.
--
-- NOTE (account enumeration): this is a deliberate product decision that REVERSES
-- the "email stays anti-enumeration" note in 0124 — the user wants an explicit
-- "email in use" message, the same trade-off already accepted for phone. The
-- function returns only a boolean, nothing else. auth.users' own unique email
-- index remains the integrity backstop (no new index needed here).
--
-- No inner BEGIN/COMMIT — the migration runner wraps this file in one transaction.

create or replace function public.email_available(p_email text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select not exists (
    select 1
    from auth.users
    where trim(coalesce(p_email, '')) <> ''
      and lower(email) = lower(trim(coalesce(p_email, '')))
      and deleted_at is null
  );
$$;

revoke all on function public.email_available(text) from public;
grant execute on function public.email_available(text) to anon, authenticated;
