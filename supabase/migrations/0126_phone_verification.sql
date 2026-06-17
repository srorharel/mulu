-- Migration 0126: phone verification (SMS OTP).
--
-- HIDDEN feature (Feature 1). This migration is INERT until the send-otp /
-- verify-otp Edge Functions are deployed AND the client flag
-- VITE_ENABLE_PHONE_VERIFY=true is set — applying it changes nothing the user
-- sees. It only adds a nullable column + a service-role-only table.
--
-- The phone itself is already collected + uniqueness-checked at signup
-- (migration 0124). This adds PROOF OF OWNERSHIP: an SMS code is sent to the
-- registered number, and on success profiles.phone_verified_at is stamped.
--
--   1. profiles.phone_verified_at — null until the number is verified. The
--      client gate (PhoneVerifyModal) and any server checks read this.
--
--   2. phone_verifications — short-lived OTP rows. RLS is ON with NO policies,
--      so ONLY the service role (the two Edge Functions) can read/write; the
--      browser never touches this table. The 6-digit code is stored only as a
--      salted SHA-256 hash, never in plaintext.
--
-- No inner BEGIN/COMMIT — the migration runner wraps this file in one transaction.

alter table public.profiles
  add column if not exists phone_verified_at timestamptz;

create table if not exists public.phone_verifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  phone        text not null,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     smallint    not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists phone_verifications_user_idx
  on public.phone_verifications (user_id);

-- Service-role-only: RLS enabled, zero policies. The Edge Functions connect
-- with the service role key (which bypasses RLS); every other role is denied.
alter table public.phone_verifications enable row level security;

comment on column public.profiles.phone_verified_at is
  'Set by the verify-otp Edge Function when the user proves ownership of profiles.phone via SMS. Null = unverified.';
comment on table public.phone_verifications is
  'Short-lived SMS OTP challenges. Service-role only (RLS on, no policies). Codes stored as salted SHA-256 hashes.';
