-- ─────────────────────────────────────────────────────────────────────────────
-- Wash seed data — development / smoke testing
--
-- Run from the Supabase SQL Editor AFTER all three migration files.
-- The SQL Editor executes as the postgres role, which bypasses RLS and can
-- write directly to auth.users.
--
-- Test account password (all five accounts): Test1234!
-- Emails:
--   consumer1@test.dev   consumer2@test.dev
--   washer1@test.dev     washer2@test.dev    washer3@test.dev
--
-- The script is idempotent — safe to re-run (uses ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────

-- pgcrypto is needed for crypt() / gen_salt() used to hash passwords
create extension if not exists pgcrypto;

-- ─── 1. auth.users ───────────────────────────────────────────────────────────
-- Inserting here fires the handle_new_user trigger, which auto-creates the
-- corresponding public.profiles row from raw_user_meta_data.

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  -- ── Consumers ──────────────────────────────────────────────────────────
  (
    '11111111-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'consumer1@test.dev',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"consumer","full_name":"Dana Cohen","phone":"050-1111111"}'::jsonb,
    now(), now()
  ),
  (
    '22222222-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'consumer2@test.dev',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"consumer","full_name":"Yossi Levi","phone":"050-2222222"}'::jsonb,
    now(), now()
  ),

  -- ── Washers ────────────────────────────────────────────────────────────
  (
    '33333333-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'washer1@test.dev',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"washer","full_name":"Avi Mizrachi","phone":"050-3333333"}'::jsonb,
    now(), now()
  ),
  (
    '44444444-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'washer2@test.dev',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"washer","full_name":"Ronit Shachar","phone":"050-4444444"}'::jsonb,
    now(), now()
  ),
  (
    '55555555-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'washer3@test.dev',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"washer","full_name":"Moshe Peretz","phone":"050-5555555"}'::jsonb,
    now(), now()
  )

on conflict (id) do nothing;

-- ─── 2. Washer online status & GPS locations (Jerusalem area) ─────────────────
-- washer1 and washer2 are online with locations; washer3 remains offline.
-- Jerusalem centre: 31.7683° N, 35.2137° E

-- washer1: near Jaffa Gate (~0.7 km from centre)
update public.profiles
set
  is_online        = true,
  current_location = ST_SetSRID(ST_MakePoint(35.2200, 31.7750), 4326)::geography
where id = '33333333-0000-0000-0000-000000000003';

-- washer2: near Mahane Yehuda Market (~1.2 km from centre)
update public.profiles
set
  is_online        = true,
  current_location = ST_SetSRID(ST_MakePoint(35.2050, 31.7600), 4326)::geography
where id = '44444444-0000-0000-0000-000000000004';

-- washer3: offline — is_online stays false, current_location stays null (defaults)

-- ─── 3. Sample orders ────────────────────────────────────────────────────────
-- The validate_order_prices BEFORE INSERT trigger overwrites base_price /
-- platform_fee / total_price with server-computed values, so the zeros below
-- are just placeholders.
--
-- car_type uses the current pricing categories ('private', 'pickup', 'jeep')
-- and service_type is always 'wash' — matching what the app creates today.

insert into public.orders (
  id,
  consumer_id, washer_id,
  car_type, service_type,
  location, address_label,
  base_price, platform_fee, total_price,
  status, accepted_at, completed_at
)
values
  -- Order A: pending — visible to online washers via nearby_jobs
  (
    'aa000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    null,
    'private', 'wash',
    ST_SetSRID(ST_MakePoint(35.2137, 31.7683), 4326)::geography,
    'Jaffa Gate, Jerusalem',
    0, 0, 0,
    'pending', null, null
  ),

  -- Order B: in_progress — consumer2 booked, washer1 is on it
  (
    'aa000000-0000-0000-0000-000000000002',
    '22222222-0000-0000-0000-000000000002',
    '33333333-0000-0000-0000-000000000003',
    'private', 'wash',
    ST_SetSRID(ST_MakePoint(35.2200, 31.7700), 4326)::geography,
    'Mahane Yehuda Market, Jerusalem',
    0, 0, 0,
    'in_progress',
    now() - interval '20 minutes',
    null
  ),

  -- Order C: completed — consumer1 booked, washer2 finished it
  (
    'aa000000-0000-0000-0000-000000000003',
    '11111111-0000-0000-0000-000000000001',
    '44444444-0000-0000-0000-000000000004',
    'pickup', 'wash',
    ST_SetSRID(ST_MakePoint(35.2300, 31.7800), 4326)::geography,
    'Hebrew University Mount Scopus, Jerusalem',
    0, 0, 0,
    'completed',
    now() - interval '2 hours 30 minutes',
    now() - interval '30 minutes'
  )

on conflict (id) do nothing;

-- ─── 4. Order audit trail ────────────────────────────────────────────────────
-- from_status = null represents the initial order creation event.

insert into public.order_events (order_id, from_status, to_status, actor_id)
values
  -- Order A: created as pending by consumer1
  ('aa000000-0000-0000-0000-000000000001', null,          'pending',     '11111111-0000-0000-0000-000000000001'),

  -- Order B: full trail up to in_progress (washer1)
  ('aa000000-0000-0000-0000-000000000002', null,          'pending',     '22222222-0000-0000-0000-000000000002'),
  ('aa000000-0000-0000-0000-000000000002', 'pending',     'accepted',    '33333333-0000-0000-0000-000000000003'),
  ('aa000000-0000-0000-0000-000000000002', 'accepted',    'en_route',    '33333333-0000-0000-0000-000000000003'),
  ('aa000000-0000-0000-0000-000000000002', 'en_route',    'arrived',     '33333333-0000-0000-0000-000000000003'),
  ('aa000000-0000-0000-0000-000000000002', 'arrived',     'in_progress', '33333333-0000-0000-0000-000000000003'),

  -- Order C: full trail to completed (washer2)
  ('aa000000-0000-0000-0000-000000000003', null,          'pending',     '11111111-0000-0000-0000-000000000001'),
  ('aa000000-0000-0000-0000-000000000003', 'pending',     'accepted',    '44444444-0000-0000-0000-000000000004'),
  ('aa000000-0000-0000-0000-000000000003', 'accepted',    'en_route',    '44444444-0000-0000-0000-000000000004'),
  ('aa000000-0000-0000-0000-000000000003', 'en_route',    'arrived',     '44444444-0000-0000-0000-000000000004'),
  ('aa000000-0000-0000-0000-000000000003', 'arrived',     'in_progress', '44444444-0000-0000-0000-000000000004'),
  ('aa000000-0000-0000-0000-000000000003', 'in_progress', 'completed',   '44444444-0000-0000-0000-000000000004');

select 'Seed complete.' as result;
