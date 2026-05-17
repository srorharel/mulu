-- Allow consumers to rate when status = 'pending_approval' (washer finished work,
-- agent review is a payment gate not a consumer-experience gate).
-- Rating stands even if agent later rejects evidence — it is a separate signal.

-- ── submit_rating ─────────────────────────────────────────────────────────────
create or replace function public.submit_rating(
  p_order_id uuid,
  p_stars    int,
  p_feedback text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order     record;
  v_caller    uuid := auth.uid();
  v_ticket_id uuid;
  v_ref_time  timestamptz;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then
    raise exception 'Order not found';
  end if;
  if v_order.consumer_id <> v_caller then
    raise exception 'Only the order consumer can rate';
  end if;
  -- Allow rating once washer has finished (pending_approval or completed)
  if v_order.status not in ('pending_approval', 'completed') then
    raise exception 'Can only rate after work is finished';
  end if;
  if v_order.rated_at is not null then
    raise exception 'Order already rated';
  end if;
  if v_order.rating_skipped then
    raise exception 'Rating already skipped for this order';
  end if;
  -- 48h window: measure from completed_at when available, else from now (pending_approval)
  v_ref_time := coalesce(v_order.completed_at, now());
  if v_ref_time < now() - interval '48 hours' then
    raise exception 'Rating window has closed';
  end if;
  if p_stars not between 1 and 5 then
    raise exception 'Invalid star value';
  end if;

  insert into public.washer_ratings (order_id, washer_id, consumer_id, stars, feedback)
  values (p_order_id, v_order.washer_id, v_caller, p_stars, nullif(trim(p_feedback), ''));

  update public.orders set rated_at = now() where id = p_order_id;

  perform public.recompute_washer_tier(v_order.washer_id);

  -- 1★: auto-create support ticket immediately, before agent approval
  if p_stars = 1 then
    insert into public.support_tickets (order_id, consumer_id, washer_id, reason, initial_feedback)
    values (p_order_id, v_caller, v_order.washer_id, 'low_rating', nullif(trim(p_feedback), ''))
    on conflict (order_id) do nothing
    returning id into v_ticket_id;
  end if;

  return jsonb_build_object(
    'ok',                true,
    'support_ticket_id', v_ticket_id
  );
end;
$$;

-- ── skip_rating ───────────────────────────────────────────────────────────────
create or replace function public.skip_rating(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null then raise exception 'Order not found'; end if;
  if v_order.consumer_id <> auth.uid() then raise exception 'Forbidden'; end if;
  if v_order.status not in ('pending_approval', 'completed') then
    raise exception 'Can only skip rating after work is finished';
  end if;
  if v_order.rated_at is not null then return; end if;
  update public.orders set rating_skipped = true where id = p_order_id;
end;
$$;

grant execute on function public.submit_rating(uuid, int, text) to authenticated;
grant execute on function public.skip_rating(uuid)              to authenticated;
