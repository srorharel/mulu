-- ─── nearby_jobs ─────────────────────────────────────────────────────────────
-- Returns pending orders within radius_km of (washer_lat, washer_lng),
-- ordered by distance ascending, with distance_km included.
-- security definer bypasses RLS on orders; the washer-role guard in the WHERE
-- ensures consumers who call this function always get zero rows.

create or replace function public.nearby_jobs(
  washer_lat float,
  washer_lng float,
  radius_km  int default 15
)
returns table (
  id              uuid,
  consumer_id     uuid,
  car_type        text,
  service_type    text,
  address_label   text,
  base_price      numeric,
  platform_fee    numeric,
  total_price     numeric,
  status          text,
  created_at      timestamptz,
  distance_km     float
)
language sql
stable
security definer
as $$
  select
    o.id,
    o.consumer_id,
    o.car_type,
    o.service_type,
    o.address_label,
    o.base_price,
    o.platform_fee,
    o.total_price,
    o.status,
    o.created_at,
    round(
      (ST_Distance(
        o.location::geography,
        ST_SetSRID(ST_MakePoint(washer_lng, washer_lat), 4326)::geography
      ) / 1000.0)::numeric,
      2
    )::float as distance_km
  from public.orders o
  where
    o.status = 'pending'
    and ST_DWithin(
      o.location::geography,
      ST_SetSRID(ST_MakePoint(washer_lng, washer_lat), 4326)::geography,
      radius_km * 1000.0
    )
    -- Caller must be an online washer; non-washers receive zero rows instead of an error.
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'washer' and is_online = true
    )
  order by distance_km asc;
$$;

grant execute on function public.nearby_jobs(float, float, int) to authenticated;


-- ─── transition_order_status ─────────────────────────────────────────────────
-- Validates the state machine transition and actor role, then updates the order
-- and inserts an audit event. Raises an exception on invalid transitions.
--
-- Washer ownership rule:
--   pending → accepted   any online washer may accept (no washer_id yet)
--   all other washer transitions require washer_id = auth.uid() (assigned washer only)

create or replace function public.transition_order_status(
  order_id   uuid,
  new_status text
)
returns void
language plpgsql
security definer
as $$
declare
  v_order        public.orders%rowtype;
  v_actor_role   text;
  v_valid        boolean := false;
begin
  -- Fetch current order (lock for update)
  select * into v_order
  from public.orders
  where id = order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  -- Fetch actor role
  select role into v_actor_role
  from public.profiles
  where id = auth.uid();

  -- ── Validate transition ──────────────────────────────────────────────────
  -- pending → accepted       (any online washer)
  if v_order.status = 'pending' and new_status = 'accepted' and v_actor_role = 'washer'
  then v_valid := true; end if;

  -- accepted → en_route      (assigned washer only)
  if v_order.status = 'accepted' and new_status = 'en_route'
     and v_actor_role = 'washer' and v_order.washer_id = auth.uid()
  then v_valid := true; end if;

  -- en_route → arrived       (assigned washer only)
  if v_order.status = 'en_route' and new_status = 'arrived'
     and v_actor_role = 'washer' and v_order.washer_id = auth.uid()
  then v_valid := true; end if;

  -- arrived → in_progress    (assigned washer only)
  if v_order.status = 'arrived' and new_status = 'in_progress'
     and v_actor_role = 'washer' and v_order.washer_id = auth.uid()
  then v_valid := true; end if;

  -- in_progress → completed  (assigned washer only)
  if v_order.status = 'in_progress' and new_status = 'completed'
     and v_actor_role = 'washer' and v_order.washer_id = auth.uid()
  then v_valid := true; end if;

  -- * → cancelled
  --   consumer can cancel if pending or accepted
  --   assigned washer can cancel if accepted
  if new_status = 'cancelled' then
    if v_order.status in ('pending', 'accepted') and v_actor_role = 'consumer'
    then v_valid := true; end if;

    if v_order.status = 'accepted' and v_actor_role = 'washer'
       and v_order.washer_id = auth.uid()
    then v_valid := true; end if;
  end if;

  if not v_valid then
    raise exception 'Invalid transition: % → % for role %',
      v_order.status, new_status, coalesce(v_actor_role, 'anonymous');
  end if;

  -- ── Apply update ─────────────────────────────────────────────────────────
  update public.orders
  set
    status       = new_status,
    washer_id    = case when new_status = 'accepted'  then auth.uid() else washer_id  end,
    accepted_at  = case when new_status = 'accepted'  then now()      else accepted_at end,
    completed_at = case when new_status = 'completed' then now()      else completed_at end
  where id = order_id;

  -- ── Audit event ──────────────────────────────────────────────────────────
  insert into public.order_events (order_id, from_status, to_status, actor_id)
  values (order_id, v_order.status, new_status, auth.uid());
end;
$$;

grant execute on function public.transition_order_status(uuid, text) to authenticated;


-- ─── validate_order_prices ───────────────────────────────────────────────────
-- BEFORE INSERT trigger on orders.
-- Recomputes base_price / platform_fee / total_price from the canonical server-
-- side price table (mirrors src/lib/pricing.js) so client-supplied values are
-- never trusted. Raises if car_type/service_type combination is unknown.

create or replace function public.validate_order_prices()
returns trigger
language plpgsql
as $$
declare
  v_base  numeric(10, 2);
  v_fee   numeric(10, 2);
begin
  v_base := case
    when new.car_type = 'sedan'  and new.service_type = 'exterior' then  60.00
    when new.car_type = 'sedan'  and new.service_type = 'interior' then  70.00
    when new.car_type = 'sedan'  and new.service_type = 'full'     then 110.00
    when new.car_type = 'suv'    and new.service_type = 'exterior' then  75.00
    when new.car_type = 'suv'    and new.service_type = 'interior' then  85.00
    when new.car_type = 'suv'    and new.service_type = 'full'     then 130.00
    when new.car_type = 'pickup' and new.service_type = 'exterior' then  80.00
    when new.car_type = 'pickup' and new.service_type = 'interior' then  90.00
    when new.car_type = 'pickup' and new.service_type = 'full'     then 140.00
    when new.car_type = 'van'    and new.service_type = 'exterior' then  90.00
    when new.car_type = 'van'    and new.service_type = 'interior' then 100.00
    when new.car_type = 'van'    and new.service_type = 'full'     then 160.00
    else null
  end;

  if v_base is null then
    raise exception 'Unknown car_type/service_type combination: %/%',
      new.car_type, new.service_type;
  end if;

  v_fee := round((v_base * 0.15)::numeric, 2);

  new.base_price   := v_base;
  new.platform_fee := v_fee;
  new.total_price  := v_base + v_fee;

  return new;
end;
$$;

create or replace trigger orders_validate_prices
  before insert on public.orders
  for each row execute function public.validate_order_prices();


-- ─── Auto-create profile on signup ───────────────────────────────────────────
-- Reads role, full_name, phone from user_metadata set during signUp()

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'consumer'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
