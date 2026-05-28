-- ── Approval lifecycle overhaul (ADR-024) ──────────────────────────────────
--
-- Enforces the support-gated approval workflow:
-- - Consumer sees NO photos and NO rating until agent approves
-- - Washer locked out of new jobs while pending_approval
-- - Decline reverts to in_progress; auto-escalates at 3 declines
-- - Correct notifications per lifecycle stage

-- ── 1. New columns on orders ────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS submitted_for_approval_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decline_count             INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_pending_approval
  ON public.orders(washer_id) WHERE status = 'pending_approval';

-- ── 2. Approval audit table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.approval_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  agent_id    UUID NOT NULL REFERENCES public.profiles(id),
  action      TEXT NOT NULL CHECK (action IN ('approved', 'declined')),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_audit_order
  ON public.approval_audit(order_id, created_at DESC);

ALTER TABLE public.approval_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_read_approval_audit" ON public.approval_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agent')
  );

CREATE POLICY "agents_insert_approval_audit" ON public.approval_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agent')
  );

-- ── 3. washer_has_pending_approval helper ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.washer_has_pending_approval(p_washer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
     WHERE washer_id = p_washer_id
       AND status = 'pending_approval'
  );
$$;

GRANT EXECUTE ON FUNCTION public.washer_has_pending_approval(UUID) TO authenticated;

-- ── 4. Update decline_order: increment decline_count, audit, auto-escalate ──

CREATE OR REPLACE FUNCTION public.decline_order(
  p_order_id  UUID,
  p_reason    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agent            UUID := auth.uid();
  v_order            public.orders%ROWTYPE;
  v_new_decline_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_agent AND role = 'agent') THEN
    RAISE EXCEPTION 'not_agent';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Invalid transition: % → in_progress for role agent', v_order.status;
  END IF;

  UPDATE orders
     SET status                    = 'in_progress',
         decline_reason            = trim(p_reason),
         declined_by               = v_agent,
         declined_at               = now(),
         decline_count             = COALESCE(decline_count, 0) + 1,
         submitted_for_approval_at = NULL
   WHERE id = p_order_id
   RETURNING decline_count INTO v_new_decline_count;

  INSERT INTO order_events (order_id, from_status, to_status, actor_id)
  VALUES (p_order_id, 'pending_approval', 'in_progress', v_agent);

  INSERT INTO approval_audit (order_id, agent_id, action, reason)
  VALUES (p_order_id, v_agent, 'declined', trim(p_reason));

  IF v_new_decline_count >= 3 THEN
    IF NOT EXISTS (
      SELECT 1 FROM support_tickets WHERE order_id = p_order_id
    ) THEN
      INSERT INTO support_tickets (order_id, consumer_id, washer_id, reason, initial_feedback)
      VALUES (
        p_order_id,
        v_order.consumer_id,
        v_order.washer_id,
        'manual',
        'Auto-escalated: order declined ' || v_new_decline_count || ' times'
      );
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_order(UUID, TEXT) TO authenticated;

-- ── 5. Update transition_order_status ───────────────────────────────────────
-- Adds: washer lockout on accept, submitted_for_approval_at, approval audit

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

  -- pending → accepted (any online washer, must not have active/pending-approval job)
  IF v_order.status = 'pending' AND new_status = 'accepted' AND v_actor_role = 'washer' THEN
    IF EXISTS (
      SELECT 1 FROM public.orders
       WHERE washer_id = auth.uid()
         AND status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
         AND id != order_id
    ) THEN
      RAISE EXCEPTION 'Cannot accept: you have an active or pending-approval job';
    END IF;
    v_valid := true;
  END IF;

  -- accepted → en_route (assigned washer only)
  IF v_order.status = 'accepted' AND new_status = 'en_route' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  -- en_route → arrived (assigned washer only, 100 m geofence, all 4 arrival photos required)
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
    IF v_order.arrival_photo_front IS NULL OR v_order.arrival_photo_back IS NULL OR
       v_order.arrival_photo_driver IS NULL OR v_order.arrival_photo_passenger IS NULL THEN
      RAISE EXCEPTION 'Arrival photos required';
    END IF;
    v_valid := true;
  END IF;

  -- arrived → in_progress (assigned washer only)
  IF v_order.status = 'arrived' AND new_status = 'in_progress' AND v_actor_role = 'washer'
     AND v_order.washer_id = auth.uid() THEN v_valid := true; END IF;

  -- in_progress → pending_approval
  IF v_order.status = 'in_progress' AND new_status = 'pending_approval'
     AND v_actor_role = 'washer' AND v_order.washer_id = auth.uid() THEN
    IF v_order.completion_photo_front IS NULL OR v_order.completion_photo_back IS NULL OR
       v_order.completion_photo_driver IS NULL OR v_order.completion_photo_passenger IS NULL THEN
      RAISE EXCEPTION 'Completion photos required';
    END IF;
    IF washer_lat IS NULL OR washer_lng IS NULL THEN
      RAISE EXCEPTION 'Worker location required to submit for approval';
    END IF;
    v_valid := true;
  END IF;

  -- pending_approval → completed (agent only; normal approval path)
  IF v_order.status = 'pending_approval' AND new_status = 'completed'
     AND v_actor_role = 'agent' THEN
    v_valid := true;
  END IF;

  -- * → cancelled
  IF new_status = 'cancelled' THEN
    IF v_order.status IN ('pending', 'accepted') AND v_actor_role = 'consumer'
      THEN v_valid := true; END IF;
    IF v_order.status IN ('accepted', 'en_route') AND v_actor_role = 'washer'
       AND v_order.washer_id = auth.uid()
      THEN v_valid := true; END IF;
    IF v_actor_role = 'agent'
       AND v_order.status NOT IN ('completed', 'cancelled')
      THEN v_valid := true; END IF;
  END IF;

  -- agent complete override: any non-terminal status
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
    status                = new_status,
    washer_id             = CASE WHEN new_status = 'accepted' THEN auth.uid() ELSE washer_id END,
    accepted_at           = CASE WHEN new_status = 'accepted' THEN now()      ELSE accepted_at END,
    completed_at          = CASE WHEN new_status = 'completed' THEN now()     ELSE completed_at END,
    approved_at           = CASE WHEN new_status = 'completed' AND v_actor_role = 'agent'
                                 THEN now()      ELSE approved_at END,
    approved_by           = CASE WHEN new_status = 'completed' AND v_actor_role = 'agent'
                                 THEN auth.uid() ELSE approved_by END,
    cancelled_by          = CASE
                              WHEN new_status = 'cancelled' THEN
                                CASE v_actor_role
                                  WHEN 'consumer' THEN 'consumer'
                                  WHEN 'washer'   THEN 'washer'
                                  WHEN 'agent'    THEN 'agent'
                                  ELSE NULL
                                END
                              ELSE cancelled_by
                            END,
    submitted_lat         = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN washer_lat ELSE submitted_lat END,
    submitted_lng         = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN washer_lng ELSE submitted_lng END,
    submitted_location_at = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN now()     ELSE submitted_location_at END,
    submitted_for_approval_at = CASE WHEN new_status = 'pending_approval'
                                     THEN now() ELSE submitted_for_approval_at END
  WHERE id = order_id;

  -- Write approval audit for agent approvals
  IF new_status = 'completed' AND v_actor_role = 'agent' AND v_order.status = 'pending_approval' THEN
    INSERT INTO public.approval_audit (order_id, agent_id, action)
    VALUES (order_id, auth.uid(), 'approved');
  END IF;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (order_id, v_order.status, new_status, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION)
  TO authenticated;

-- ── 6. Update nearby_jobs: exclude callers with active/pending-approval jobs ─
--
-- IMPORTANT: this redeclaration is a strict superset of the live function from
-- 0005_nearby_jobs_coords.sql. We keep the live RETURNS shape (13 columns
-- including lat / lng — used by WorkerMap.jsx to render job pins) and only
-- *add* the new NOT EXISTS clause that excludes the calling washer when they
-- already have an active or pending_approval order.
--
-- DROP first because PostgreSQL refuses CREATE OR REPLACE when the RETURNS
-- TABLE shape ever differs from what's live — defensive even though our
-- rewrite matches live exactly. The runner wraps every migration in a single
-- BEGIN/COMMIT, so a failure between DROP and CREATE rolls both back.

DROP FUNCTION IF EXISTS public.nearby_jobs(double precision, double precision, integer);

CREATE OR REPLACE FUNCTION public.nearby_jobs(
  washer_lat float,
  washer_lng float,
  radius_km  int default 15
)
RETURNS TABLE (
  id              uuid,
  consumer_id     uuid,
  car_type        text,
  service_type    text,
  address_label   text,
  base_price      numeric,
  platform_fee    numeric,
  total_price     numeric,
  status          text,
  created_at      timestamptz,
  distance_km     float,
  lat             float,
  lng             float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    o.id,
    o.consumer_id,
    o.car_type,
    o.service_type,
    o.address_label,
    o.base_price,
    o.platform_fee,
    o.total_price,
    o.status,
    o.created_at,
    round(
      (ST_Distance(
        o.location::geography,
        ST_SetSRID(ST_MakePoint(washer_lng, washer_lat), 4326)::geography
      ) / 1000.0)::numeric,
      2
    )::float                          as distance_km,
    ST_Y(o.location::geometry)::float as lat,
    ST_X(o.location::geometry)::float as lng
  FROM public.orders o
  WHERE
    o.status = 'pending'
    AND ST_DWithin(
      o.location::geography,
      ST_SetSRID(ST_MakePoint(washer_lng, washer_lat), 4326)::geography,
      radius_km * 1000.0
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'washer' AND is_online = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.orders o2
       WHERE o2.washer_id = auth.uid()
         AND o2.status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
    )
  ORDER BY distance_km ASC;
$$;

GRANT EXECUTE ON FUNCTION public.nearby_jobs(float, float, int) TO authenticated;

-- ── 7. Update find_nearby_washers_for_order: exclude busy washers ───────────

CREATE OR REPLACE FUNCTION public.find_nearby_washers_for_order(
  p_order_id uuid,
  p_radius_m double precision DEFAULT 15000
)
RETURNS TABLE (washer_id uuid, dist_m double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id                                                                            AS washer_id,
    ST_Distance(p.current_location::geography, o.location::geography)::double precision AS dist_m
  FROM public.profiles p
  JOIN public.orders   o ON o.id = p_order_id
  WHERE p.role                = 'washer'
    AND p.is_online            = true
    AND p.current_location    IS NOT NULL
    AND ST_DWithin(p.current_location::geography, o.location::geography, p_radius_m)
    AND p.id NOT IN (
          SELECT own.washer_id
          FROM   public.order_washer_notifications own
          WHERE  own.order_id = p_order_id
        )
    AND NOT EXISTS (
      SELECT 1 FROM public.orders o2
       WHERE o2.washer_id = p.id
         AND o2.status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
    )
  ORDER BY dist_m ASC;
$$;

GRANT EXECUTE ON FUNCTION public.find_nearby_washers_for_order(uuid, double precision)
  TO authenticated;

-- ── 8. Update get_washer_active_job: include pending_approval ───────────────

CREATE OR REPLACE FUNCTION public.get_washer_active_job()
RETURNS TABLE (id uuid, lat float, lng float)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    o.id,
    ST_Y(o.location::geometry)::float as lat,
    ST_X(o.location::geometry)::float as lng
  FROM public.orders o
  WHERE
    o.washer_id = auth.uid()
    AND o.status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_washer_active_job() TO authenticated;

-- ── 9. Update notification trigger ──────────────────────────────────────────
-- - pending_approval: notify WASHER (acknowledgment), NOT consumer
-- - completed: notify washer (approved) + consumer (wash complete)
-- - in_progress from pending_approval (decline): notify washer with reason

CREATE OR REPLACE FUNCTION public.notify_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_data JSONB;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  v_order_data := jsonb_build_object(
    'order_id',     NEW.id::TEXT,
    'cancelled_by', COALESCE(NEW.cancelled_by, '')
  );

  CASE NEW.status

    WHEN 'accepted' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'order_accepted', v_order_data);

    WHEN 'en_route' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'washer_on_way', v_order_data);

    WHEN 'arrived' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'washer_arrived', v_order_data);

    WHEN 'pending_approval' THEN
      IF NEW.washer_id IS NOT NULL THEN
        PERFORM public.notify_send(NEW.washer_id, 'wash_pending_review', v_order_data);
      END IF;

    WHEN 'completed' THEN
      IF NEW.washer_id IS NOT NULL THEN
        PERFORM public.notify_send(NEW.washer_id, 'order_approved', v_order_data);
      END IF;
      PERFORM public.notify_send(NEW.consumer_id, 'wash_complete_consumer', v_order_data);

    WHEN 'in_progress' THEN
      IF OLD.status = 'pending_approval' AND NEW.washer_id IS NOT NULL THEN
        PERFORM public.notify_send(
          NEW.washer_id,
          'wash_declined',
          jsonb_build_object(
            'order_id', NEW.id::TEXT,
            'reason',   COALESCE(NEW.decline_reason, '')
          )
        );
      END IF;

    WHEN 'cancelled' THEN
      IF NEW.cancelled_by IS NULL THEN
        RAISE WARNING 'notify_on_order_change: order % cancelled with NULL cancelled_by — skipping notification', NEW.id;
      ELSIF NEW.cancelled_by = 'consumer' THEN
        IF NEW.washer_id IS NOT NULL THEN
          PERFORM public.notify_send(NEW.washer_id, 'customer_cancelled', v_order_data);
        END IF;
      ELSIF NEW.cancelled_by = 'washer' THEN
        PERFORM public.notify_send(NEW.consumer_id, 'order_cancelled', v_order_data);
      ELSIF NEW.cancelled_by IN ('agent', 'system') THEN
        PERFORM public.notify_send(NEW.consumer_id, 'order_cancelled', v_order_data);
        IF NEW.washer_id IS NOT NULL THEN
          PERFORM public.notify_send(NEW.washer_id, 'order_cancelled', v_order_data);
        END IF;
      END IF;

    ELSE
      NULL;

  END CASE;

  RETURN NEW;
END;
$$;

-- ── 10. Realtime publication for approval_audit ─────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'approval_audit'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_audit;
  END IF;
END $$;
