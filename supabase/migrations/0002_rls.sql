-- Enable RLS on all tables
alter table public.profiles    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_events enable row level security;

-- ─── profiles ────────────────────────────────────────────────────────────────

-- Any authenticated user can read their own profile
create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

-- Any authenticated user can read online washers (for future washer-finder feature)
create policy "profiles: read online washers"
  on public.profiles for select
  using (role = 'washer' and is_online = true);

-- Users can only update their own profile
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

-- Supabase auth trigger inserts profile on signup — allow insert for own id
create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ─── orders ──────────────────────────────────────────────────────────────────

-- Consumers: read their own orders
create policy "orders: consumer read own"
  on public.orders for select
  using (consumer_id = auth.uid());

-- Consumers: insert their own orders
create policy "orders: consumer insert"
  on public.orders for insert
  with check (consumer_id = auth.uid());

-- Washers: read pending orders within 15 km (spatial check done via RPC; broad select here)
-- The nearby_jobs() RPC applies the distance filter; this policy just gates washer access.
create policy "orders: washer read pending"
  on public.orders for select
  using (
    status = 'pending'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'washer' and is_online = true
    )
  );

-- Washers: read their own assigned orders (any status)
create policy "orders: washer read assigned"
  on public.orders for select
  using (washer_id = auth.uid());

-- Washers: update only their own assigned orders (transition enforced via function)
create policy "orders: washer update assigned"
  on public.orders for update
  using (washer_id = auth.uid() or (status = 'pending' and washer_id is null));

-- ─── order_events ────────────────────────────────────────────────────────────

-- Consumer or washer on the parent order can read events
create policy "order_events: read if party"
  on public.order_events for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.consumer_id = auth.uid() or o.washer_id = auth.uid())
    )
  );

-- Insert is allowed only by authenticated users (actual actor check in the function)
create policy "order_events: insert authenticated"
  on public.order_events for insert
  with check (auth.uid() is not null);
