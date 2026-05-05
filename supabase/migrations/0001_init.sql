-- Enable required extensions
create extension if not exists postgis;
create extension if not exists "uuid-ossp";

-- Profiles table (extends auth.users)
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  role             text not null check (role in ('consumer', 'washer')),
  full_name        text,
  phone            text,
  equipment_notes  text,
  is_online        boolean not null default false,
  current_location geography(Point, 4326),
  created_at       timestamptz not null default now()
);

-- Orders table
create table public.orders (
  id                  uuid primary key default uuid_generate_v4(),
  consumer_id         uuid not null references public.profiles(id),
  washer_id           uuid references public.profiles(id),
  car_type            text not null check (car_type in ('sedan', 'suv', 'pickup', 'van')),
  service_type        text not null check (service_type in ('exterior', 'interior', 'full')),
  location            geography(Point, 4326) not null,
  address_label       text,
  base_price          numeric(10, 2) not null,
  platform_fee        numeric(10, 2) not null,
  total_price         numeric(10, 2) not null,
  status              text not null default 'pending'
                        check (status in ('pending','accepted','en_route','arrived','in_progress','completed','cancelled')),
  cancellation_reason text,
  created_at          timestamptz not null default now(),
  accepted_at         timestamptz,
  completed_at        timestamptz
);

-- Order audit log (insert-only via trigger)
create table public.order_events (
  id          bigserial primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor_id    uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- Spatial indexes
create index orders_location_gist    on public.orders using gist (location);
create index profiles_location_gist  on public.profiles using gist (current_location);

-- B-tree indexes for common filter patterns
create index orders_status_idx       on public.orders (status);
create index orders_washer_id_idx    on public.orders (washer_id);
create index orders_consumer_id_idx  on public.orders (consumer_id);
