-- ── Item 2: PostGIS coordinate cleanup ────────────────────────────────────────
-- Add lat/lng columns to nearby_jobs return shape, derived from the PostGIS
-- geometry column. Removes the fragile address_label string-parsing pattern.
-- Existing columns (including address_label) are kept for backwards compat.

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
  distance_km     float,
  lat             float,
  lng             float
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
    )::float                           as distance_km,
    ST_Y(o.location::geometry)::float  as lat,
    ST_X(o.location::geometry)::float  as lng
  from public.orders o
  where
    o.status = 'pending'
    and ST_DWithin(
      o.location::geography,
      ST_SetSRID(ST_MakePoint(washer_lng, washer_lat), 4326)::geography,
      radius_km * 1000.0
    )
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'washer' and is_online = true
    )
  order by distance_km asc;
$$;

-- New RPC: washer's current active job with coordinates from geometry.
-- Replaces the direct orders-table query + address_label parsing in Dashboard.
create or replace function public.get_washer_active_job()
returns table (id uuid, lat float, lng float)
language sql
stable
security definer
as $$
  select
    o.id,
    ST_Y(o.location::geometry)::float as lat,
    ST_X(o.location::geometry)::float as lng
  from public.orders o
  where
    o.washer_id = auth.uid()
    and o.status in ('accepted', 'en_route', 'arrived', 'in_progress')
  limit 1;
$$;

grant execute on function public.get_washer_active_job() to authenticated;
