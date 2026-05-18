-- ── Notification trigger polish ───────────────────────────────────────────────
-- Changes vs 0044:
--   notify_on_order_change:
--     • cancelled_by now included in payload only for 'cancelled' status events.
--       Previously every status event emitted cancelled_by:'', which was noise
--       on order_accepted, washer_on_way, wash_completed, etc.
--     • Route pre-computation comment added (see below).

CREATE OR REPLACE FUNCTION public.notify_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base_data   JSONB;
  v_cancel_data JSONB;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  -- Base payload: order_id only. cancelled_by is added below only when relevant.
  v_base_data := jsonb_build_object('order_id', NEW.id::TEXT);

  -- Route pre-computation note:
  --   notify_on_order_message (chat trigger) pre-computes data.route because
  --   the recipient role (consumer vs washer) determines the route, and the
  --   trigger already holds that information from its ORDER query.
  --   notify_on_order_change (status trigger) does NOT pre-compute data.route
  --   because the Edge Function's routeFor() map already handles all status
  --   events correctly from event_type + order_id alone, so duplicating the
  --   route map in SQL would be redundant. The Edge Function applies
  --   `data.route ?? routeFor(event_type, data)` either way.

  CASE NEW.status

    WHEN 'accepted' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'order_accepted', v_base_data);

    WHEN 'en_route' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'washer_on_way', v_base_data);

    WHEN 'arrived' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'washer_arrived', v_base_data);

    -- arrived → in_progress: no notification.
    -- Flag: add WHEN 'in_progress' here if "Wash started" copy is ever needed.

    WHEN 'pending_approval' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'wash_completed', v_base_data);

    WHEN 'completed' THEN
      IF NEW.washer_id IS NOT NULL THEN
        PERFORM public.notify_send(NEW.washer_id, 'order_approved', v_base_data);
      END IF;

    WHEN 'cancelled' THEN
      -- cancelled_by is included here (and only here) because the Edge Function
      -- uses it to render different body copy for washer-cancel vs support-cancel.
      -- customer_cancelled (consumer cancelled, washer notified) does not need it
      -- because its body copy is a static string.
      v_cancel_data := v_base_data || jsonb_build_object('cancelled_by', COALESCE(NEW.cancelled_by, ''));

      IF NEW.cancelled_by IS NULL THEN
        RAISE WARNING 'notify_on_order_change: order % cancelled with NULL cancelled_by — skipping notification', NEW.id;

      ELSIF NEW.cancelled_by = 'consumer' THEN
        IF NEW.washer_id IS NOT NULL THEN
          -- customer_cancelled uses static body; base payload (no cancelled_by) is sufficient.
          PERFORM public.notify_send(NEW.washer_id, 'customer_cancelled', v_base_data);
        END IF;

      ELSIF NEW.cancelled_by = 'washer' THEN
        PERFORM public.notify_send(NEW.consumer_id, 'order_cancelled', v_cancel_data);

      ELSIF NEW.cancelled_by IN ('agent', 'system') THEN
        PERFORM public.notify_send(NEW.consumer_id, 'order_cancelled', v_cancel_data);
        IF NEW.washer_id IS NOT NULL THEN
          PERFORM public.notify_send(NEW.washer_id, 'order_cancelled', v_cancel_data);
        END IF;

      END IF;

    ELSE
      NULL;

  END CASE;

  RETURN NEW;
END;
$$;
