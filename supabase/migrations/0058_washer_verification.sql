-- profiles: verification status + areas + dealer number
alter table profiles
  add column if not exists washer_verification_status text
    check (washer_verification_status in ('pending_documents','pending_review','approved','rejected')),
  add column if not exists washer_service_areas text[] default '{}',
  add column if not exists washer_dealer_number text;

-- new submissions table
create table if not exists washer_verifications (
  id uuid primary key default gen_random_uuid(),
  washer_id uuid not null references profiles(id) on delete cascade,
  dealer_number text not null,
  service_areas text[] not null,
  id_document_path text not null,
  liveness_paths text[] not null,
  business_license_path text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','rejected')),
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id)
);

create index if not exists washer_verifications_status_idx on washer_verifications (status, submitted_at desc);
create index if not exists washer_verifications_washer_idx on washer_verifications (washer_id);

alter table washer_verifications enable row level security;

-- washer can read/insert their own
create policy "washer_self_read" on washer_verifications
  for select using (auth.uid() = washer_id);
create policy "washer_self_insert" on washer_verifications
  for insert with check (auth.uid() = washer_id);

-- agents can read all + update
create policy "agent_read_all" on washer_verifications
  for select using (exists (
    select 1 from profiles where id = auth.uid() and role = 'agent'
  ));
create policy "agent_update" on washer_verifications
  for update using (exists (
    select 1 from profiles where id = auth.uid() and role = 'agent'
  ));

-- RPC for agent decision
create or replace function review_washer_verification(
  p_verification_id uuid,
  p_decision text,
  p_reason text default null
) returns void
language plpgsql security definer as $$
declare v_washer uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'agent') then
    raise exception 'agents only';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'invalid decision';
  end if;

  update washer_verifications
     set status = p_decision,
         rejection_reason = case when p_decision = 'rejected' then p_reason else null end,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_verification_id
  returning washer_id into v_washer;

  update profiles
     set washer_verification_status = p_decision
   where id = v_washer;
end$$;

-- Storage bucket: washer-verification (create via dashboard; policies below)
-- Run these in Supabase dashboard SQL editor after creating the bucket:
--
-- insert into storage.buckets (id, name, public) values ('washer-verification', 'washer-verification', false)
-- on conflict (id) do nothing;
--
-- create policy "washer own folder insert" on storage.objects for insert
--   with check (bucket_id = 'washer-verification' and auth.uid()::text = split_part(name, '/', 1));
--
-- create policy "washer own folder select" on storage.objects for select
--   using (bucket_id = 'washer-verification' and auth.uid()::text = split_part(name, '/', 1));
--
-- create policy "agent washer-verification select" on storage.objects for select
--   using (bucket_id = 'washer-verification' and exists (
--     select 1 from public.profiles where id = auth.uid() and role = 'agent'
--   ));
