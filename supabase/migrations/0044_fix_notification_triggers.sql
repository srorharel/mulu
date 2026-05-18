-- ── Fix push notification trigger functions ───────────────────────────────────
-- Changes vs 0043:
--   notify_send: added EXCEPTION WHEN OTHERS so pg_net failures never abort
--                the order UPDATE that invoked the trigger.
--   notify_on_order_change: en_route→arrived now sends 'washer_arrived'
--                           (not 'washer_on_way') so the consumer gets
--                           distinct copy for the two status changes.

-- ── notify_send: non-blocking wrapper around pg_net ──────────────────────────

CREATE OR REPLACE FUNCTION public.notify_send(
  p_user_id   UUID,
  p_event     TEXT,
  p_data      JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_url  TEXT;
  v_key  TEXT;
BEGIN
  v_url := current_setting('app.settings.edge_function_url', true) || '/send-notification';
  v_key := current_setting('app.settings.service_role_key',  true);

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'notify_send: edge_function_url or service_role_key not configured — skipping';
    RETURN;
  END IF;

  PERFORM pg_net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object(
                 'user_id',    p_user_id,
                 'event_type', p_event,
                 'data',       p_data
               )
  );

EXCEPTION WHEN OTHERS THEN
  -- pg_net failure must never abort the transaction that triggered this call.
  -- The notification is lost for this event; the order state change commits.
  RAISE WARNING 'notify_send: pg_net call failed (non-blocking): % — event=% user=%',
    SQLERRM, p_event, p_user_id;
END;
$$;

-- ── notify_on_order_change: correct washer_arrived event ─────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_data JSONB;
BEGIN
  -- Only act when status actually changes (IS NOT DISTINCT FROM handles NULLs
  -- safely, though status is NOT NULL in the schema).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  v_order_data := jsonb_build_object(
    'order_id',     NEW.id::TEXT,
    'cancelled_by', COALESCE(NEW.cancelled_by, '')
  );

  CASE NEW.status

    -- pending → accepted: notify consumer
    WHEN 'accepted' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'order_accepted', v_order_data);

    -- accepted → en_route: notify consumer ("on the way")
    WHEN 'en_route' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'washer_on_way', v_order_data);

    -- en_route → arrived: notify consumer ("has arrived") — distinct from on_way
    WHEN 'arrived' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'washer_arrived', v_order_data);

    -- arrived → in_progress: no notification (wash has started; no consumer action needed)
    -- Flag: if "Wash started" copy is ever wanted, add it here.

    -- in_progress → pending_approval: notify consumer (rating prompt)
    WHEN 'pending_approval' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'wash_completed', v_order_data);

    -- pending_approval → completed (agent approval): notify washer
    WHEN 'completed' THEN
      IF NEW.washer_id IS NOT NULL THEN
        PERFORM public.notify_send(NEW.washer_id, 'order_approved', v_order_data);
      END IF;

    -- * → cancelled: branch on cancelled_by × washer_id per NOTIFICATIONS.md table
    WHEN 'cancelled' THEN
      IF NEW.cancelled_by IS NULL THEN
        -- Legacy row (pre-0042) or system call without auth.uid().
        RAISE WARNING 'notify_on_order_change: order % cancelled with NULL cancelled_by — skipping notification', NEW.id;

      ELSIF NEW.cancelled_by = 'consumer' THEN
        -- Consumer cancelled: notify washer only if one was assigned.
        IF NEW.washer_id IS NOT NULL THEN
          PERFORM public.notify_send(NEW.washer_id, 'customer_cancelled', v_order_data);
        END IF;
        -- washer_id IS NULL → no one to notify.

      ELSIF NEW.cancelled_by = 'washer' THEN
        -- Washer cancelled: notify consumer.
        PERFORM public.notify_send(NEW.consumer_id, 'order_cancelled', v_order_data);

      ELSIF NEW.cancelled_by IN ('agent', 'system') THEN
        -- Support/system cancelled: notify consumer always; notify washer if assigned.
        PERFORM public.notify_send(NEW.consumer_id, 'order_cancelled', v_order_data);
        IF NEW.washer_id IS NOT NULL THEN
          PERFORM public.notify_send(NEW.washer_id, 'order_cancelled', v_order_data);
        END IF;

      END IF;

    ELSE
      -- Any other status (in_progress, etc.): no notification fired.
      NULL;

  END CASE;

  RETURN NEW;
END;
$$;

-- Trigger definition unchanged from 0043; CREATE OR REPLACE FUNCTION above
-- already replaces the function body in place. The trigger binding remains.
