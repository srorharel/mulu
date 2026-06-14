-- Migration 0121: record legal consent given at registration.
--
-- PROBLEM: the signup form requires a "I accept the Terms of Use + Privacy
-- Policy" checkbox, but that consent was purely client-side gating — it was never
-- written to user_legal_acknowledgments. So pending_legal_acknowledgments still
-- reported those docs as unacknowledged, and LegalUpdateModal re-prompted the
-- user on their very first login, immediately after they had just accepted the
-- terms during registration.
--
-- FIX: seed the acknowledgment atomically with profile creation, gated on an
-- `accepted_legal` flag the signup form now passes in raw_user_meta_data. This
-- fires at signUp time for BOTH the auto-login and the email-confirmation flows
-- (the auth.users row — and therefore on_auth_user_created — is inserted at
-- signUp regardless of whether email is confirmed). Net effect: a freshly
-- registered user is NOT re-prompted, and the modal reappears ONLY when a new
-- version of a doc is published (acknowledged_version < current version).
--
-- Doc types mirror pending_legal_acknowledgments (0118):
--   consumer → consumer_terms + privacy_policy
--   washer   → privacy_policy  ONLY. The washer CONTRACT (washer_terms) is a
--              separate, post-approval acknowledgment made through the modal — it
--              is NOT covered by the signup checkbox, so it is never seeded here.
--
-- handle_new_user is redefined with CREATE OR REPLACE (signature unchanged → the
-- on_auth_user_created trigger binding is preserved; no DROP needed). No inner
-- BEGIN/COMMIT — the runner wraps this file in one transaction.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'consumer');

  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    v_role,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone'
  );

  -- Record the Terms+Privacy consent captured on the signup form. A new profile
  -- has no locale yet, so it resolves to 'he' (matching pending_legal_*) — seed
  -- at the current he version. on conflict is purely defensive (brand-new user).
  if (new.raw_user_meta_data->>'accepted_legal') = 'true'
     and v_role in ('consumer', 'washer') then
    insert into public.user_legal_acknowledgments (user_id, doc_type, acknowledged_version)
    select new.id, ut.doc_type, d.version
    from unnest(
      case when v_role = 'consumer'
           then array['consumer_terms','privacy_policy']
           else array['privacy_policy']
      end
    ) as ut(doc_type)
    join lateral (
      select ld.version
      from public.legal_documents ld
      where ld.doc_type = ut.doc_type
        and ld.is_current
      order by (ld.locale = 'he') desc
      limit 1
    ) d on true
    on conflict (user_id, doc_type) do nothing;
  end if;

  return new;
end;
$$;

-- One-time backfill: existing consumer/washer accounts consented at registration
-- (the Terms+Privacy checkbox has been required since the consent gate shipped)
-- but that consent predates this migration and was never recorded, so they would
-- be prompted once on next login. Seed the acknowledgment at the CURRENT version
-- (resolved by the user's own locale, he-fallback) so they are not re-prompted
-- for docs they already accepted. Only inserts where no acknowledgment row exists
-- (never downgrades an existing one; never seeds the post-approval washer
-- contract). Idempotent — safe to re-run.
insert into public.user_legal_acknowledgments (user_id, doc_type, acknowledged_version)
select p.id, ut.doc_type, d.version
from public.profiles p
cross join lateral unnest(
  case when p.role = 'consumer' then array['consumer_terms','privacy_policy']
       when p.role = 'washer'   then array['privacy_policy']
       else array[]::text[]
  end
) as ut(doc_type)
join lateral (
  select ld.version
  from public.legal_documents ld
  where ld.doc_type = ut.doc_type
    and ld.is_current
  order by (ld.locale = coalesce(p.locale, 'he')) desc
  limit 1
) d on true
where p.role in ('consumer', 'washer')
on conflict (user_id, doc_type) do nothing;
