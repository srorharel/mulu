-- Fix "column reference id is ambiguous" in get_washer_verifications.
-- The RETURNS TABLE output column named "id" conflicts with profiles.id in the
-- if-not-exists agent check. Fully qualifying all column references resolves it.

create or replace function get_washer_verifications(p_status text default null)
returns table (
  id uuid,
  washer_id uuid,
  dealer_number text,
  service_areas text[],
  id_document_path text,
  selfie_path text,
  business_license_path text,
  status text,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  washer_name text,
  washer_phone text,
  washer_email text
)
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.role = 'agent'
  ) then
    raise exception 'agents only' using errcode = 'PT403';
  end if;

  return query
  select
    v.id, v.washer_id, v.dealer_number, v.service_areas,
    v.id_document_path, v.selfie_path, v.business_license_path,
    v.status, v.rejection_reason, v.submitted_at, v.reviewed_at, v.reviewed_by,
    p.full_name::text, p.phone::text, u.email::text
  from public.washer_verifications v
  left join public.profiles p on p.id = v.washer_id
  left join auth.users u on u.id = v.washer_id
  where (p_status is null or v.status = p_status)
  order by v.submitted_at asc;
end$$;

grant execute on function get_washer_verifications(text) to authenticated;
