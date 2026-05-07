-- Add lat/lng as generated columns derived from orders.location geometry.
-- Returned by select(*) so useRealtimeOrder and OrderHistory get coords without
-- any code changes to those queries.
alter table public.orders
  add column if not exists lat double precision
    generated always as (st_y(location::geometry)) stored,
  add column if not exists lng double precision
    generated always as (st_x(location::geometry)) stored;
