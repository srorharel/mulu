alter table public.orders
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_city   text;
