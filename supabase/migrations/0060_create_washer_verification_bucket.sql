-- Create the washer-verification private storage bucket
insert into storage.buckets (id, name, public)
values ('washer-verification', 'washer-verification', false)
on conflict (id) do nothing;

-- Drop old policies if they exist from manual applies or previous runs
drop policy if exists "washer own folder insert"      on storage.objects;
drop policy if exists "washer own folder select"      on storage.objects;
drop policy if exists "agent washer-verification select" on storage.objects;
drop policy if exists "washer_upload_own"             on storage.objects;
drop policy if exists "washer_read_own"               on storage.objects;
drop policy if exists "washer_update_own"             on storage.objects;
drop policy if exists "agent_read_all_verification"   on storage.objects;

create policy "washer_upload_own"
  on storage.objects for insert
  with check (
    bucket_id = 'washer-verification'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "washer_read_own"
  on storage.objects for select
  using (
    bucket_id = 'washer-verification'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "washer_update_own"
  on storage.objects for update
  using (
    bucket_id = 'washer-verification'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "agent_read_all_verification"
  on storage.objects for select
  using (
    bucket_id = 'washer-verification'
    and exists (
      select 1 from public.profiles where id = auth.uid() and role = 'agent'
    )
  );
