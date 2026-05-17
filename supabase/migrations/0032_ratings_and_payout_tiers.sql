-- ── Rating system + tiered washer payouts ────────────────────────────────────
-- Adds: washer_ratings, support_tickets, tier columns on profiles,
--       rating columns on orders, payout_amount on orders,
--       recompute_washer_tier / submit_rating / skip_rating / payout_for_tier RPCs,
--       update_rating_elaboration RPC (post-submit feedback append),
--       and updates transition_order_status to lock payout_amount at acceptance.

-- ── 1. washer_ratings ────────────────────────────────────────────────────────
create table if not exists public.washer_ratings (
  id          uuid        primary key default gen_random_uuid(),
  order_id    uuid        not null unique references public.orders(id) on delete cascade,
  washer_id   uuid        not null references public.profiles(id) on delete cascade,
  consumer_id uuid        not null references public.profiles(id) on delete cascade,
  stars       int         not null check (stars between 1 and 5),
  feedback    text        check (length(feedback) <= 1000),
  created_at  timestamptz not null default now()
);

create index if not exists idx_washer_ratings_washer_created
  on public.washer_ratings(washer_id, created_at desc);

-- ── 2. support_tickets (for 1★ auto-escalation) ──────────────────────────────
create table if not exists public.support_tickets (
  id               uuid        primary key default gen_random_uuid(),
  order_id         uuid        not null unique references public.orders(id) on delete cascade,
  consumer_id      uuid        not null references public.profiles(id) on delete cascade,
  washer_id        uuid        references public.profiles(id) on delete set null,
  reason           text        not null check (reason in ('low_rating', 'manual')),
  status           text        not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  initial_feedback text,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

create index if not exists idx_support_tickets_status_created
  on public.support_tickets(status, created_at desc);

-- ── 3. Tier columns on profiles ──────────────────────────────────────────────
alter table public.profiles
  add column if not exists current_rating  numeric(3,2),
  add column if not exists current_tier    int,
  add column if not exists rated_job_count int not null default 0,
  add column if not exists tier_changed_at timestamptz;

-- ── 4. Rating + payout columns on orders ─────────────────────────────────────
alter table public.orders
  add column if not exists rated_at       timestamptz,
  add column if not exists rating_skipped boolean not null default false,
  add column if not exists payout_amount  numeric(10,2);

-- ── 5. payout_for_tier ───────────────────────────────────────────────────────
create or replace function public.payout_for_tier(p_tier int)
returns numeric
language sql
immutable
as $$
  select case p_tier
    when 1 then 40
    when 2 then 45
    when 3 then 50
    when 4 then 55
    when 5 then 60
    else       50  -- unrated default (3★ equivalent)
  end::numeric;
$$;

-- ── 6. recompute_washer_tier ─────────────────────────────────────────────────
create or replace function public.recompute_washer_tier(p_washer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg   numeric;
  v_count int;
  v_tier  int;
  v_old_tier int;
begin
  select count(*) into v_count
    from public.washer_ratings
   where washer_id = p_washer_id;

  -- Under 3 ratings: stay in unrated state
  if v_count < 3 then
    update public.profiles
       set current_rating  = null,
           current_tier    = null,
           rated_job_count = v_count
     where id = p_washer_id;
    return;
  end if;

  -- Rolling average over last 20 ratings
  select avg(stars) into v_avg
  from (
    select stars
      from public.washer_ratings
     where washer_id = p_washer_id
     order by created_at desc
     limit 20
  ) recent;

  -- Floor to tier, clamp 1..5 (only 5.0 exact = tier 5)
  v_tier := greatest(1, least(5, floor(v_avg)::int));

  select current_tier into v_old_tier
    from public.profiles where id = p_washer_id;

  update public.profiles
     set current_rating  = round(v_avg, 2),
         current_tier    = v_tier,
         rated_job_count = v_count,
         tier_changed_at = case
           when v_old_tier is distinct from v_tier then now()
           else tier_changed_at
         end
   where id = p_washer_id;
end;
$$;

-- ── 7. submit_rating ─────────────────────────────────────────────────────────
create or replace function public.submit_rating(
  p_order_id uuid,
  p_stars    int,
  p_feedback text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order    record;
  v_caller   uuid := auth.uid();
  v_ticket_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then
    raise exception 'Order not found';
  end if;
  if v_order.consumer_id <> v_caller then
    raise exception 'Only the order consumer can rate';
  end if;
  if v_order.status <> 'completed' then
    raise exception 'Can only rate completed orders';
  end if;
  if v_order.rated_at is not null then
    raise exception 'Order already rated';
  end if;
  if v_order.rating_skipped then
    raise exception 'Rating already skipped for this order';
  end if;
  if v_order.completed_at < now() - interval '48 hours' then
    raise exception 'Rating window has closed';
  end if;
  if p_stars not between 1 and 5 then
    raise exception 'Invalid star value';
  end if;

  insert into public.washer_ratings (order_id, washer_id, consumer_id, stars, feedback)
  values (p_order_id, v_order.washer_id, v_caller, p_stars, nullif(trim(p_feedback), ''));

  update public.orders set rated_at = now() where id = p_order_id;

  perform public.recompute_washer_tier(v_order.washer_id);

  if p_stars = 1 then
    insert into public.support_tickets (order_id, consumer_id, washer_id, reason, initial_feedback)
    values (p_order_id, v_caller, v_order.washer_id, 'low_rating', nullif(trim(p_feedback), ''))
    returning id into v_ticket_id;
  end if;

  return jsonb_build_object(
    'ok',               true,
    'support_ticket_id', v_ticket_id
  );
end;
$$;

-- ── 8. skip_rating ───────────────────────────────────────────────────────────
create or replace function public.skip_rating(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then raise exception 'Order not found'; end if;
  if v_order.consumer_id <> auth.uid() then raise exception 'Forbidden'; end if;
  if v_order.rated_at is not null then return; end if;
  update public.orders set rating_skipped = true where id = p_order_id;
end;
$$;

-- ── 9. update_rating_elaboration (post-submit follow-up feedback) ─────────────
create or replace function public.update_rating_elaboration(
  p_order_id      uuid,
  p_extra_feedback text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.washer_ratings
     set feedback = case
           when feedback is null then nullif(trim(p_extra_feedback), '')
           else feedback || e'\n\n' || trim(p_extra_feedback)
         end
   where order_id    = p_order_id
     and consumer_id = auth.uid();
end;
$$;

-- ── 10. transition_order_status: write payout_amount at acceptance ────────────
-- NOTE: 0032 was originally written based on 0023, which caused it to overwrite
-- the 0031 photo-evidence logic. Migration 0033 contains the corrected body.
-- This stub is kept here so the schema_migrations record for 0032 remains valid.
-- On a fresh DB, 0033 runs immediately after and installs the correct version.
-- (CREATE OR REPLACE is idempotent — the final state after both migrations is correct.)

-- ── 11. RLS ───────────────────────────────────────────────────────────────────
alter table public.washer_ratings  enable row level security;
alter table public.support_tickets enable row level security;

-- Washers read their own ratings (core feature)
create policy "Washers read own ratings"
  on public.washer_ratings for select to authenticated
  using (washer_id = auth.uid());

-- Consumers read ratings they submitted (for "already rated" UI state)
create policy "Consumers read own submitted ratings"
  on public.washer_ratings for select to authenticated
  using (consumer_id = auth.uid());

-- Agents read all ratings (for support context)
create policy "Agents read all ratings"
  on public.washer_ratings for select to authenticated
  using (public.is_agent());

-- Support tickets: consumers see their own
create policy "Consumers read own tickets"
  on public.support_tickets for select to authenticated
  using (consumer_id = auth.uid());

-- Agents: full access to tickets
create policy "Agents manage all tickets"
  on public.support_tickets for all to authenticated
  using (public.is_agent());

-- ── 12. Grants ────────────────────────────────────────────────────────────────
grant execute on function public.submit_rating(uuid, int, text)     to authenticated;
grant execute on function public.skip_rating(uuid)                  to authenticated;
grant execute on function public.update_rating_elaboration(uuid, text) to authenticated;

-- ── 13. Realtime publication ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'washer_ratings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.washer_ratings;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;
END $$;
