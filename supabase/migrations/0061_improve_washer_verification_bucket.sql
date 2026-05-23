-- Ensure washer-verification bucket exists with correct settings.
-- Uses ON CONFLICT DO UPDATE so it is safe to re-run.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'washer-verification',
  'washer-verification',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Verify bucket was created/updated
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'washer-verification') then
    raise exception 'washer-verification bucket not found after upsert';
  end if;
  raise notice 'washer-verification bucket OK';
end $$;

-- Drop old policies so re-running is idempotent
drop policy if exists "washer own folder insert"          on storage.objects;
drop policy if exists "washer own folder select"          on storage.objects;
drop policy if exists "agent washer-verification select"  on storage.objects;
drop policy if exists "washer_upload_own"                 on storage.objects;
drop policy if exists "washer_read_own"                   on storage.objects;
drop policy if exists "washer_update_own"                 on storage.objects;
drop policy if exists "washer_delete_own"                 on storage.objects;
drop policy if exists "agent_read_all_verification"       on storage.objects;

create policy "washer_upload_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'washer-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "washer_read_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'washer-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "washer_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'washer-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "washer_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'washer-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "agent_read_all_verification"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'washer-verification'
    and exists (
      select 1 from public.profiles where id = auth.uid() and role = 'agent'
    )
  );
