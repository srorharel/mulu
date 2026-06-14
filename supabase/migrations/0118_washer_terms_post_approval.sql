-- Migration 0118: gate the washer contract (washer_terms) to post-approval.
--
-- A washer must sign the washer contract only AFTER support approves their
-- verification (profiles.washer_verification_status = 'approved', set by the
-- agent decision in 0058). Before approval the washer has the 'washer' role
-- (they can still be mid-verification), so the prior logic prompted the contract
-- too early. The PRIVACY POLICY is NOT gated — it governs data collection from
-- first use, so washers still acknowledge it immediately. Consumers and
-- agents/super_admins are unchanged.
--
-- Redefines pending_legal_acknowledgments; the RETURNS TABLE shape is unchanged.
-- DROP-before-CREATE per migration discipline (re-grants execute). No inner
-- BEGIN/COMMIT — the runner wraps this file in one transaction.

DROP FUNCTION IF EXISTS public.pending_legal_acknowledgments(uuid);

CREATE FUNCTION public.pending_legal_acknowledgments(p_user_id uuid)
RETURNS TABLE (
  doc_type       text,
  version        int,
  locale         text,
  title          text,
  content        text,
  effective_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_role   text;
  v_locale text;
  v_verif  text;
  v_types  text[];
begin
  -- Callers may only query their own pending acknowledgments.
  if p_user_id is distinct from auth.uid() then
    raise exception 'can only query your own pending acknowledgments';
  end if;

  select p.role, coalesce(p.locale, 'he'), p.washer_verification_status
    into v_role, v_locale, v_verif
  from public.profiles p
  where p.id = p_user_id;

  if v_role = 'consumer' then
    v_types := array['consumer_terms','privacy_policy'];
  elsif v_role = 'washer' then
    -- Privacy applies from first use; the CONTRACT only after support approval.
    if v_verif = 'approved' then
      v_types := array['washer_terms','privacy_policy'];
    else
      v_types := array['privacy_policy'];
    end if;
  else
    return;   -- agents / super_admins have nothing to acknowledge
  end if;

  return query
  select d.doc_type, d.version, d.locale, d.title, d.content, d.effective_date
  from unnest(v_types) as ut(doc_type)
  join lateral (
    select ld.*
    from public.legal_documents ld
    where ld.doc_type = ut.doc_type
      and ld.is_current
      and ld.locale in (v_locale, 'he')
    order by (ld.locale = v_locale) desc
    limit 1
  ) d on true
  left join public.user_legal_acknowledgments a
    on a.user_id = p_user_id and a.doc_type = d.doc_type
  where a.acknowledged_version is null
     or a.acknowledged_version < d.version;
end;
$$;

GRANT EXECUTE ON FUNCTION public.pending_legal_acknowledgments(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
