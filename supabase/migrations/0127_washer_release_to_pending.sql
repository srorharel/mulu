-- Migration 0127: a washer "cancel" RELEASES the order back to the pending pool
-- instead of terminally cancelling it for everyone.
--
-- Before this migration, a washer cancelling their accepted/en_route job moved
-- the order straight to 'cancelled' (terminal) — killing the consumer's order
-- and ending the job for everyone. Product decision: a washer dropping a job
-- should NOT cancel the customer's order. The order should return to 'pending'
-- and be re-offered to every washer, exactly like a fresh booking.
--
-- This redefines public.transition_order_status with TWO surgical changes vs 0116
-- (EVERYTHING else — admin-override branch + audit, ADR-035 underground
-- relaxations, the config-driven arrival geofence, the consumer cancellation fee,
-- all other transitions, the order_events insert — is reproduced byte-for-byte):
--   1. the washer self-cancel-to-terminal branch is REMOVED — a washer can no
--      longer move an order to 'cancelled'; and
--   2. a NEW transition is added: the assigned washer may move an accepted/en_route
--      order BACK to 'pending' (release). On release the order is un-assigned
--      (washer_id → NULL, accepted_at → NULL) and any arrival-photo evidence the
--      releasing washer captured is cleared, so the next washer starts clean.
--
-- It also adds an AFTER UPDATE re-fan-out trigger (notify_on_order_repend): when
-- an order returns to 'pending' from a non-pending status, the per-order
-- notification dedup table is reset and the fan-out-nearby-job Edge Function is
-- re-invoked, so nearby washers are notified the job is available again — the
-- same reach a brand-new order gets via 0053's AFTER INSERT trigger.
--
-- Consumer/agent cancellation is unchanged. Consumers keep their cancel (with the
-- 0116 fee from en_route/arrived); agents/super_admins keep full cancel power.
--
-- DROP-before-CREATE per migration discipline (signature unchanged; the CI
-- state-machine guard asserts DROP precedes CREATE). No inner BEGIN/COMMIT — the
-- runner wraps this file in one transaction. admin_force_order_stage (0101) calls
-- transition_order_status by name; plpgsql bodies create no hard dependency, so
-- the DROP is safe and the wrapper is intentionally NOT recreated here.

-- Idempotent heal: the function below references orders.cancellation_fee (added
-- by 0116). Re-declare it IF NOT EXISTS so the function and its column dependency
-- travel together (no-op on any DB that already ran 0116).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancellation_fee numeric(10, 2) NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.transition_order_status(uuid, text, double precision, double precision, boolean);

CREATE OR REPLACE FUNCTION public.transition_order_status(
  order_id          uuid,
  new_status        text,
  washer_lat        double precision DEFAULT NULL,
  washer_lng        double precision DEFAULT NULL,
  p_admin_override  boolean          DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order          public.orders%ROWTYPE;
  v_actor_role     text;
  v_actor_id       uuid := auth.uid();
  v_valid          boolean := false;
  v_is_admin       boolean := false;
  v_distance_m     double precision;
  v_geofence_m     double precision;
  v_force_reason   text;
  v_cancel_fee     numeric := 0;       -- 0116: consumer cancellation fee (en_route/arrived)
  v_washer_release boolean := false;   -- 0127: washer released the job back to the pool
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE id = v_actor_id;

  v_is_admin := (p_admin_override IS TRUE) AND (v_actor_role = 'super_admin');

  -- Admin override path (force stage): ANY current status — forward, backward,
  -- skipping, or out of a terminal state — → any status in the CHECK set.
  -- No photo/GPS/geofence/sequence gate. The target MUST be in the allowed set
  -- or the UPDATE below would violate orders_status_check; validate for a clear
  -- error message instead of a constraint violation.
  IF v_is_admin THEN
    IF new_status NOT IN ('pending','accepted','en_route','arrived','in_progress','pending_approval','completed','cancelled') THEN
      RAISE EXCEPTION 'invalid status: %', new_status;
    END IF;
    v_valid := true;
  ELSE
    -- ── Normal paths (unchanged from 0116 except the cancellation changes
    --    flagged inline below) ──────────────────────────────────────────────────

    -- pending → accepted (any online washer, must not have active/pending-approval job)
    IF v_order.status = 'pending' AND new_status = 'accepted' AND v_actor_role = 'washer' THEN
      IF EXISTS (
        SELECT 1 FROM public.orders
         WHERE washer_id = v_actor_id
           AND status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
           AND id != order_id
      ) THEN
        RAISE EXCEPTION 'Cannot accept: you have an active or pending-approval job';
      END IF;
      v_valid := true;
    END IF;

    -- accepted → en_route (assigned washer only)
    IF v_order.status = 'accepted' AND new_status = 'en_route' AND v_actor_role = 'washer'
       AND v_order.washer_id = v_actor_id THEN v_valid := true; END IF;

    -- en_route → arrived (assigned washer, configurable geofence, 4 arrival photos).
    -- ADR-035: underground orders skip the GPS-required + geofence gates (no
    -- reception in a subterranean garage). The 4 arrival photos stay mandatory
    -- for every order; non-underground behaviour is byte-for-byte unchanged.
    IF v_order.status = 'en_route' AND new_status = 'arrived' AND v_actor_role = 'washer'
       AND v_order.washer_id = v_actor_id THEN
      IF NOT v_order.is_underground_parking THEN
        IF washer_lat IS NULL OR washer_lng IS NULL THEN
          RAISE EXCEPTION 'Worker location required for arrival';
        END IF;
        v_distance_m := ST_Distance(
          v_order.location::geography,
          ST_MakePoint(washer_lng, washer_lat)::geography
        );
        v_geofence_m := public.get_config_number('arrival_geofence_meters', 100);
        IF v_distance_m > v_geofence_m THEN
          RAISE EXCEPTION 'Too far from location: % meters', ROUND(v_distance_m::numeric);
        END IF;
      END IF;
      IF v_order.arrival_photo_front IS NULL OR v_order.arrival_photo_back IS NULL OR
         v_order.arrival_photo_driver IS NULL OR v_order.arrival_photo_passenger IS NULL THEN
        RAISE EXCEPTION 'Arrival photos required';
      END IF;
      v_valid := true;
    END IF;

    -- arrived → in_progress (assigned washer only)
    IF v_order.status = 'arrived' AND new_status = 'in_progress' AND v_actor_role = 'washer'
       AND v_order.washer_id = v_actor_id THEN v_valid := true; END IF;

    -- in_progress → pending_approval
    IF v_order.status = 'in_progress' AND new_status = 'pending_approval'
       AND v_actor_role = 'washer' AND v_order.washer_id = v_actor_id THEN
      IF v_order.completion_photo_front IS NULL OR v_order.completion_photo_back IS NULL OR
         v_order.completion_photo_driver IS NULL OR v_order.completion_photo_passenger IS NULL THEN
        RAISE EXCEPTION 'Completion photos required';
      END IF;
      -- ADR-035: underground orders may submit with null GPS (captured offline,
      -- no reception). submitted_lat/lng stay null for these — the agent approval
      -- card renders a "location unavailable (underground)" state, not a map.
      IF NOT v_order.is_underground_parking THEN
        IF washer_lat IS NULL OR washer_lng IS NULL THEN
          RAISE EXCEPTION 'Worker location required to submit for approval';
        END IF;
      END IF;
      v_valid := true;
    END IF;

    -- pending_approval → completed (agent only; normal approval path)
    IF v_order.status = 'pending_approval' AND new_status = 'completed'
       AND v_actor_role = 'agent' THEN
      v_valid := true;
    END IF;

    -- 0127: washer RELEASE — accepted/en_route → pending by the assigned washer.
    -- This is the washer's "give up the job" action. It does NOT terminate the
    -- order; it un-assigns the washer (see the UPDATE below) and returns the order
    -- to the pending pool so any washer can pick it up again. Replaces the old
    -- washer self-cancel-to-terminal branch so a washer can never kill the
    -- consumer's order.
    IF v_order.status IN ('accepted', 'en_route') AND new_status = 'pending'
       AND v_actor_role = 'washer' AND v_order.washer_id = v_actor_id THEN
      v_washer_release := true;
      v_valid := true;
    END IF;

    -- * → cancelled
    IF new_status = 'cancelled' THEN
      -- 0116: consumers may cancel from pending/accepted (free) AND from
      -- en_route/arrived (50 ₪ fee, computed below).
      IF v_order.status IN ('pending', 'accepted', 'en_route', 'arrived') AND v_actor_role = 'consumer'
        THEN v_valid := true; END IF;
      -- 0127: the washer self-cancel-to-terminal branch is REMOVED — washers
      -- release to 'pending' (above) rather than cancelling the order for everyone.
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
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid transition: % → % for role %',
      v_order.status, new_status, COALESCE(v_actor_role, 'anonymous');
  END IF;

  -- 0116: fixed cancellation fee — only when the CONSUMER cancels after the washer
  -- is already travelling/on-site (en_route/arrived). Capped at the order total so
  -- it can never exceed the original price. Free in every other case (agent/admin
  -- cancel, a washer release, or a consumer cancel from pending/accepted).
  IF new_status = 'cancelled' AND v_actor_role = 'consumer'
     AND v_order.status IN ('en_route', 'arrived') THEN
    v_cancel_fee := LEAST(public.get_config_number('cancellation_fee_ils', 50), v_order.total_price);
  END IF;

  UPDATE public.orders SET
    status                = new_status,
    -- 0127: a washer release un-assigns the washer so the order re-enters the pool.
    washer_id             = CASE
                              WHEN new_status = 'accepted' AND NOT v_is_admin THEN v_actor_id
                              WHEN v_washer_release                           THEN NULL
                              ELSE washer_id END,
    accepted_at           = CASE
                              WHEN new_status = 'accepted' THEN COALESCE(accepted_at, now())
                              WHEN v_washer_release        THEN NULL
                              ELSE accepted_at END,
    -- 0127: clear the releasing washer's arrival-photo evidence so the next washer
    -- starts clean (they may have uploaded some while en_route, before arriving).
    arrival_photo_front     = CASE WHEN v_washer_release THEN NULL ELSE arrival_photo_front     END,
    arrival_photo_back      = CASE WHEN v_washer_release THEN NULL ELSE arrival_photo_back      END,
    arrival_photo_driver    = CASE WHEN v_washer_release THEN NULL ELSE arrival_photo_driver    END,
    arrival_photo_passenger = CASE WHEN v_washer_release THEN NULL ELSE arrival_photo_passenger END,
    completed_at          = CASE WHEN new_status = 'completed' THEN now()     ELSE completed_at END,
    approved_at           = CASE WHEN new_status = 'completed' AND (v_actor_role = 'agent' OR v_is_admin)
                                 THEN now()      ELSE approved_at END,
    approved_by           = CASE WHEN new_status = 'completed' AND (v_actor_role = 'agent' OR v_is_admin)
                                 THEN v_actor_id ELSE approved_by END,
    cancelled_by          = CASE
                              WHEN new_status = 'cancelled' THEN
                                CASE
                                  WHEN v_is_admin            THEN 'agent'
                                  WHEN v_actor_role='consumer' THEN 'consumer'
                                  WHEN v_actor_role='washer'   THEN 'washer'
                                  WHEN v_actor_role='agent'    THEN 'agent'
                                  ELSE NULL
                                END
                              ELSE cancelled_by
                            END,
    cancellation_fee      = CASE WHEN new_status = 'cancelled' THEN v_cancel_fee ELSE cancellation_fee END,
    submitted_lat         = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN washer_lat ELSE submitted_lat END,
    submitted_lng         = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN washer_lng ELSE submitted_lng END,
    submitted_location_at = CASE WHEN new_status = 'pending_approval' AND v_actor_role = 'washer'
                                 THEN now()     ELSE submitted_location_at END,
    submitted_for_approval_at = CASE WHEN new_status = 'pending_approval'
                                     THEN now() ELSE submitted_for_approval_at END
  WHERE id = order_id;

  -- Approval audit for agent approvals (unchanged behavior from 0066).
  IF new_status = 'completed' AND v_actor_role = 'agent' AND v_order.status = 'pending_approval' THEN
    INSERT INTO public.approval_audit (order_id, agent_id, action)
    VALUES (order_id, v_actor_id, 'approved');
  END IF;

  -- Admin override audit row. When invoked via admin_force_order_stage the
  -- wrapper sets app.force_stage_reason (txn-local); tag the row 'force_stage'
  -- and carry the reason. Otherwise keep the legacy labels (force-complete /
  -- cancel / force-status) so existing direct callers are unchanged.
  IF v_is_admin THEN
    v_force_reason := NULLIF(trim(current_setting('app.force_stage_reason', true)), '');
    INSERT INTO public.admin_order_audit (order_id, admin_id, action, reason, payload)
    VALUES (
      order_id, v_actor_id,
      CASE WHEN v_force_reason IS NOT NULL THEN 'force_stage'
           WHEN new_status = 'cancelled'   THEN 'cancel'
           WHEN new_status = 'completed'   THEN 'force_complete'
           ELSE 'force_status' END,
      v_force_reason,
      jsonb_build_object('from_status', v_order.status, 'to_status', new_status)
        || CASE WHEN v_force_reason IS NOT NULL
                THEN jsonb_build_object('reason', v_force_reason)
                ELSE '{}'::jsonb END
    );
  END IF;

  INSERT INTO public.order_events (order_id, from_status, to_status, actor_id)
  VALUES (order_id, v_order.status, new_status, v_actor_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, text, double precision, double precision, boolean)
  TO authenticated;

-- ── Re-fan-out when an order returns to the pending pool ──────────────────────
-- Mirrors 0053's notify_on_new_order (AFTER INSERT), but fires AFTER UPDATE when
-- an order transitions BACK to 'pending' from a non-pending status (washer
-- release, or an admin force-to-pending). Resets the per-order notification dedup
-- table so previously-notified washers are eligible again, then re-invokes the
-- fan-out-nearby-job Edge Function. Non-blocking: any failure only logs a warning.

CREATE OR REPLACE FUNCTION public.notify_on_order_repend()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  -- Only act when an order RE-enters the pending pool (not on the initial insert,
  -- which 0053's AFTER INSERT trigger already fans out).
  IF NEW.status <> 'pending' OR OLD.status IS NOT DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  -- Reset the dedup table so nearby washers can be re-notified. Keep the washer
  -- who just released excluded from THIS round so they aren't pinged about the
  -- job they just dropped (they can still see it in nearby_jobs if they want it).
  DELETE FROM public.order_washer_notifications WHERE order_id = NEW.id;
  IF OLD.washer_id IS NOT NULL THEN
    INSERT INTO public.order_washer_notifications (order_id, washer_id)
    VALUES (NEW.id, OLD.washer_id)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'fan_out_nearby_job_url' LIMIT 1;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'notify_on_order_repend: Vault secrets fan_out_nearby_job_url or service_role_key not found — skipping';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('order_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A re-fan-out failure must never abort the status change that triggered it.
  RAISE WARNING 'notify_on_order_repend: net.http_post failed (non-blocking): %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_order_repend ON public.orders;
CREATE TRIGGER trg_notify_on_order_repend
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'pending' AND OLD.status IS DISTINCT FROM 'pending')
  EXECUTE FUNCTION public.notify_on_order_repend();

NOTIFY pgrst, 'reload schema';
