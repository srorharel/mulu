-- Security-definer RPC so agents can read washer email from auth.users
-- (profiles does not expose email; auth.users is not directly queryable by clients)

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
language plpgsql security definer as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'agent') then
    raise exception 'agents only';
  end if;

  return query
  select
    v.id, v.washer_id, v.dealer_number, v.service_areas,
    v.id_document_path, v.selfie_path, v.business_license_path,
    v.status, v.rejection_reason, v.submitted_at, v.reviewed_at, v.reviewed_by,
    p.full_name, p.phone, u.email
  from washer_verifications v
  left join profiles p on p.id = v.washer_id
  left join auth.users u on u.id = v.washer_id
  where (p_status is null or v.status = p_status)
  order by v.submitted_at asc;
end$$;

grant execute on function get_washer_verifications(text) to authenticated;
