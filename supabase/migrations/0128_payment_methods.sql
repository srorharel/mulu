-- Migration 0128: saved payment methods (card-on-file via tokenization).
--
-- HIDDEN feature (part of Payments, ADR-043). INERT until the save-card /
-- charge-saved-card Edge Functions are deployed AND VITE_ENABLE_PAYMENTS=true.
-- Applying it changes nothing the user sees.
--
-- SAFETY MODEL — we NEVER store a card number. The clearing company keeps the
-- card and returns a reusable TOKEN; we store only that token + harmless display
-- bits (brand, last4, expiry). The token column is written ONLY by the service
-- role (save-card Edge Fn) and is NOT readable by the browser (column-level
-- GRANTs below exclude provider_token), so the token never reaches the client.
-- Charging is done server-side by charge-saved-card using the token.
--
-- No inner BEGIN/COMMIT — the migration runner wraps this file in one transaction.

-- ── 1. Table ──────────────────────────────────────────────────────────────────

create table if not exists public.payment_methods (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.profiles(id) on delete cascade,
  provider       text        not null,              -- which clearing company issued the token
  provider_token text        not null,              -- reusable token (NOT a card number) — service-role only
  brand          text,                              -- 'visa' | 'mastercard' | 'isracard' | 'amex' | ...
  last4          text,
  exp_month      smallint,
  exp_year       smallint,
  is_default     boolean     not null default false,
  created_at     timestamptz not null default now()
);

-- At most one default card per user (DB-enforced).
create unique index if not exists payment_methods_one_default_per_user
  on public.payment_methods (user_id) where is_default = true;
create index if not exists payment_methods_user_idx on public.payment_methods (user_id);

-- ── 2. Auto-default the first saved card (BEFORE INSERT, mirrors vehicles 0041) ─
create or replace function public.payment_methods_auto_default()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.payment_methods
    where user_id = new.user_id and is_default = true
  ) then
    new.is_default := true;
  end if;
  return new;
end;
$$;

drop trigger if exists payment_methods_auto_default_trg on public.payment_methods;
create trigger payment_methods_auto_default_trg
  before insert on public.payment_methods
  for each row execute function public.payment_methods_auto_default();

-- ── 3. RLS — owner reads/deletes own rows; NO client insert/update ─────────────
alter table public.payment_methods enable row level security;

drop policy if exists "payment_methods: owner reads own" on public.payment_methods;
create policy "payment_methods: owner reads own"
  on public.payment_methods for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "payment_methods: owner deletes own" on public.payment_methods;
create policy "payment_methods: owner deletes own"
  on public.payment_methods for delete to authenticated
  using (user_id = auth.uid());

-- Rows are INSERTed only by the service role (save-card); the default flag is
-- flipped only via set_default_payment_method() — so no client INSERT/UPDATE.

-- ── 4. Column-level grants — the token is NEVER readable by the client ─────────
-- RLS scopes ROWS; these GRANTs scope COLUMNS. Granting SELECT on everything
-- EXCEPT provider_token means a browser `select=provider_token` is rejected by
-- Postgres even for the owner's own row. The service role bypasses both.
revoke all on public.payment_methods from anon, authenticated;
grant select (id, user_id, provider, brand, last4, exp_month, exp_year, is_default, created_at)
  on public.payment_methods to authenticated;
grant delete on public.payment_methods to authenticated;

-- ── 5. set_default_payment_method RPC (SECURITY DEFINER, ownership-checked) ────
drop function if exists public.set_default_payment_method(uuid);
create function public.set_default_payment_method(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.payment_methods
    where id = p_id and user_id = auth.uid()
  ) then
    raise exception 'payment method not found or not owned by current user';
  end if;

  update public.payment_methods
    set is_default = false
    where user_id = auth.uid() and is_default = true and id <> p_id;

  update public.payment_methods
    set is_default = true
    where id = p_id;
end;
$$;

revoke all on function public.set_default_payment_method(uuid) from public;
grant execute on function public.set_default_payment_method(uuid) to authenticated;

-- ── 6. Order payment state ─────────────────────────────────────────────────────
-- Recorded server-side by charge-saved-card (and, later, the new-card webhook).
-- paid_at lets washer-visibility be gated on payment when the live charge is
-- wired (ADR-042/043). Nullable: existing/scaffold orders stay unpaid.
alter table public.orders
  add column if not exists paid_at           timestamptz,
  add column if not exists payment_ref       text,
  add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null;

comment on table public.payment_methods is
  'Card-on-file: reusable clearing-company TOKENS (never card numbers). provider_token is service-role-only (column GRANTs exclude it from authenticated). ADR-043.';
comment on column public.orders.paid_at is
  'Set when payment is captured (charge-saved-card / new-card webhook). Null = unpaid.';

-- ── 7. Reload PostgREST schema cache ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
