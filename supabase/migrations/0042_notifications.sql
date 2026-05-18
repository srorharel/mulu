-- ── Push Notifications: tables, preferences, and RPC update ─────────────────
-- Creates: device_tokens, notification_preferences, notification_log
-- Adds:    orders.cancelled_by column
-- Updates: transition_order_status to populate cancelled_by on cancel
-- Adds:    trigger to auto-insert notification_preferences row on user creation


-- ── 1. device_tokens ─────────────────────────────────────────────────────────

create table public.device_tokens (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  token        text        not null,
  platform     text        not null check (platform in ('ios', 'android', 'web')),
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (user_id, token)
);

create index device_tokens_user_id_idx on public.device_tokens(user_id);

alter table public.device_tokens enable row level security;

-- Users manage their own tokens
create policy "Users can select own device tokens"
  on public.device_tokens for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own device tokens"
  on public.device_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own device tokens"
  on public.device_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own device tokens"
  on public.device_tokens for delete
  to authenticated
  using (user_id = auth.uid());

-- Service role can read all tokens (needed by send-notification Edge Function)
-- Service role bypasses RLS by default in Supabase; no explicit policy needed.
-- The above policies cover authenticated (anon/user) sessions only.


-- ── 2. notification_preferences ──────────────────────────────────────────────

create table public.notification_preferences (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  enabled    boolean     not null default true,
  sound      text        not null default 'default'
               check (sound in ('default', 'chime', 'bell', 'gentle')),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "Users can select own notification preferences"
  on public.notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can update own notification preferences"
  on public.notification_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Auto-insert default row when a new auth user is created
create or replace function public.create_default_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
exception when others then
  return new;  -- never block user signup over a preferences row failure
end;
$$;

create trigger trg_create_notification_preferences
  after insert on auth.users
  for each row
  execute function public.create_default_notification_preferences();

-- Back-fill a default row for every existing user who doesn't have one yet.
-- Uses on conflict do nothing so re-running the migration is safe.
insert into public.notification_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;


-- ── 3. notification_log ───────────────────────────────────────────────────────

create table public.notification_log (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  event_type  text        not null,
  payload     jsonb       not null default '{}'::jsonb,
  delivered   boolean     not null default false,
  error       text,
  created_at  timestamptz not null default now()
);

create index notification_log_user_id_created_idx
  on public.notification_log(user_id, created_at desc);

alter table public.notification_log enable row level security;

-- No authenticated-user policies: users do not read this table directly.
-- Only the service role (Edge Function) writes and reads it.


-- ── 4. orders.cancelled_by column ────────────────────────────────────────────

alter table public.orders
  add column if not exists cancelled_by text
    check (cancelled_by in ('consumer', 'washer', 'agent', 'system'));

-- No backfill: existing cancelled rows pre-date this migration and will be
-- treated as legacy no-ops by the notification trigger (null → skip).


-- ── 5. transition_order_status — populate cancelled_by on cancel ──────────────
-- Preserved verbatim from 0023 except:
--   Added: cancelled_by stamped when new_status = 'cancelled', inferred from
--          v_actor_role. System calls (null auth.uid) leave cancelled_by null,
--          which the notification trigger treats as the legacy-skip case.

CREATE OR REPLACE FUNCTION public.transition_order_status(
  order_id   UUID,
  new_status TEXT,
  washer_lat DOUBLE PRECISION DEFAULT NULL,
  washer_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order      public.orders%ROWTYPE;
  v_actor_role TEXT;
  v_valid      BOOLEAN := false;
  v_distance_m DOUBLE PRECISION;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE id = auth.uid();

  -- pending → accepted (any online washer)
  IF v_order.status = 'pending' AND new_status = 'accepted' AND v_actor_role = 'washer'
    THEN v_valid := true; END IF;

  -- accepted → en_route (assigned washer only)
  IF v_order.status = 'accepted' AND new_status = 'en_route' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  -- en_route → arrived (assigned washer only, 100 m geofence)
  IF v_order.status = 'en_route' AND new_status = 'arrived' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN
    IF washer_lat IS NULL OR washer_lng IS NULL THEN
      RAISE EXCEPTION 'Worker location required for arrival';
    END IF;
    v_distance_m := ST_Distance(
      v_order.location::geography,
      ST_MakePoint(washer_lng, washer_lat)::geography
    );
    IF v_distance_m > 100 THEN
      RAISE EXCEPTION 'Too far from location: % meters', ROUND(v_distance_m::numeric);
    END IF;
    v_valid := true;
  END IF;

  -- arrived → in_progress (assigned washer only)
  IF v_order.status = 'arrived' AND new_status = 'in_progress' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  -- in_progress → pending_approval (assigned washer; before + after evidence required)
  IF v_order.status = 'in_progress' AND new_status = 'pending_approval'
     AND v_actor_role = 'washer' AND v_order.washer_id = auth.uid() THEN
    IF v_order.evidence_before_path IS NULL OR v_order.evidence_after_path IS NULL THEN
      RAISE EXCEPTION 'Before and after evidence required to submit for approval';
    END IF;
    v_valid := true;
  END IF;

  -- pending_approval → completed (agent only; normal approval path)
  IF v_order.status = 'pending_approval' AND new_status = 'completed'
     AND v_actor_role = 'agent' THEN
    v_valid := true;
  END IF;

  -- * → cancelled
  --   consumer: pending or accepted
  --   assigned washer: accepted or en_route
  IF new_status = 'cancelled' THEN
    IF v_order.status IN ('pending', 'accepted') AND v_actor_role = 'consumer'
      THEN v_valid := true; END IF;
    IF v_order.status IN ('accepted', 'en_route') AND v_actor_role = 'washer'
       AND v_order.washer_id = auth.uid()
      THEN v_valid := true; END IF;

    -- Agent can cancel from any non-terminal status
    IF v_actor_role = 'agent'
       AND v_order.status NOT IN ('completed', 'cancelled')
      THEN v_valid := true; END IF;
  END IF;

  -- Agent complete override: complete from any non-terminal status (bypasses pending_approval)
  IF new_status = 'completed'
     AND v_actor_role = 'agent'
     AND v_order.status NOT IN ('completed', 'cancelled') THEN
    v_valid := true;
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid transition: % → % for role %',
      v_order.status, new_status, COALESCE(v_actor_role, 'anonymous');
  END IF;

  UPDATE public.orders SET
    status       = new_status,
    washer_id    = CASE WHEN new_status = 'accepted'   THEN auth.uid() ELSE washer_id    END,
    accepted_at  = CASE WHEN new_status = 'accepted'   THEN now()      ELSE accepted_at  END,
    completed_at = CASE WHEN new_status = 'completed'  THEN now()      ELSE completed_at END,
    approved_at  = CASE WHEN new_status = 'completed' AND v_actor_role = 'agent'
                        THEN now()      ELSE approved_at END,
    approved_by  = CASE WHEN new_status = 'completed' AND v_actor_role = 'agent'
                        THEN auth.uid() ELSE approved_by END,
    -- Populate cancelled_by from the actor's role. Null when auth.uid() is null
    -- (system/service-role call) — notification trigger treats null as legacy skip.
    cancelled_by = CASE
      WHEN new_status = 'cancelled' THEN
        CASE v_actor_role
          WHEN 'consumer' THEN 'consumer'
          WHEN 'washer'   THEN 'washer'
          WHEN 'agent'    THEN 'agent'
          ELSE NULL
        END
      ELSE cancelled_by
    END
  WHERE id = order_id;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (order_id, v_order.status, new_status, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
