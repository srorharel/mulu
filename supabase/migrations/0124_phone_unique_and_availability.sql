-- Migration 0124: phone uniqueness + a pre-signup availability probe.
--
-- Registration now collects a phone number and must reject a number already
-- attached to another account ("phone already in use"). Two parts:
--
--   1. public.phone_available(p_phone) — a SECURITY DEFINER boolean the signup
--      form calls BEFORE auth.signUp, so it can surface a clean inline message
--      instead of letting the insert fail deep inside the handle_new_user trigger
--      (where Supabase only bubbles up a generic "Database error saving new user").
--      Numbers are compared digits-only (regexp_replace(..,'\D','')), matching the
--      Profile-page phone validation, so "050-123 4567" and "0501234567" collide.
--      (Limitation: a number typed as +972… normalises differently from the 0-
--      prefixed local form; the app collects local 05X numbers, so this is fine.)
--
--   2. A partial UNIQUE INDEX on the digits-only phone as the integrity backstop —
--      it covers races and direct Profile edits that bypass the probe. Created
--      inside a DO/EXCEPTION block so a pre-existing duplicate in live data
--      DOWNGRADES to a NOTICE instead of breaking the deploy; uniqueness is then
--      enforced by phone_available() + the app layer until the dupes are cleaned.
--
-- handle_new_user already persists raw_user_meta_data->>'phone' (migration 0121),
-- so no trigger change is needed — the signup form simply passes `phone` now.
--
-- NOTE (account enumeration): phone_available() is intentionally callable by anon
-- (signup happens logged-out) and reveals whether a phone is registered. This is a
-- deliberate product decision — email stays anti-enumeration; phone gets an
-- explicit uniqueness check. The function returns only a boolean, nothing else.
--
-- No inner BEGIN/COMMIT — the migration runner wraps this file in one transaction.

create or replace function public.phone_available(p_phone text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select not exists (
    select 1
    from public.profiles
    where regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') <> ''
      and regexp_replace(coalesce(phone, ''), '\D', '', 'g')
        = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  );
$$;

revoke all on function public.phone_available(text) from public;
grant execute on function public.phone_available(text) to anon, authenticated;

-- Integrity backstop. `if not exists` keeps it idempotent; the exception handler
-- keeps the deploy alive if historical duplicate phones exist (the probe + app
-- layer still enforce uniqueness for new signups in that case).
do $$
begin
  create unique index if not exists profiles_phone_digits_uidx
    on public.profiles (regexp_replace(phone, '\D', '', 'g'))
    where phone is not null and regexp_replace(phone, '\D', '', 'g') <> '';
exception when unique_violation then
  raise notice
    'profiles_phone_digits_uidx skipped: existing duplicate phone numbers present. '
    'Uniqueness enforced by phone_available() + app layer until duplicates are resolved.';
end $$;
