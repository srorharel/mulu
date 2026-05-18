-- NOTE: notify_send() and notify_on_order_change() bodies are superseded by
-- 0044_fix_notification_triggers.sql. Read both files together when reasoning
-- about current behavior. Do not "consolidate" by deleting 0044 — the fixes
-- will be lost.
--
-- ── Push notification triggers ───────────────────────────────────────────────
-- Fires pg_net HTTP calls to the send-notification Edge Function on:
--   • orders UPDATE  — status transitions
--   • order_messages INSERT — direct washer↔consumer chat
--
-- Prerequisites:
--   • pg_net extension enabled (CREATE EXTENSION IF NOT EXISTS pg_net)
--   • Database setting: ALTER DATABASE postgres
--       SET app.settings.service_role_key = '<service-role-key>';
--   • Database setting: ALTER DATABASE postgres
--       SET app.settings.edge_function_url = 'https://<project>.supabase.co/functions/v1';
--
-- The trigger functions read these settings at call time via current_setting().
-- Neither value is stored in migration SQL or committed to git.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Helper: fire one notification call (non-blocking) ────────────────────────

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
END;
$$;

-- ── Trigger: orders status changes ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_data JSONB;
BEGIN
  -- Only act on status transitions
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  v_order_data := jsonb_build_object(
    'order_id',    NEW.id::TEXT,
    'cancelled_by', COALESCE(NEW.cancelled_by, '')
  );

  CASE NEW.status

    -- pending → accepted: notify consumer
    WHEN 'accepted' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'order_accepted', v_order_data);

    -- accepted → en_route: notify consumer
    WHEN 'en_route' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'washer_on_way', v_order_data);

    -- en_route → arrived: notify consumer
    WHEN 'arrived' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'washer_on_way', v_order_data);

    -- in_progress → pending_approval: notify consumer (rating prompt)
    WHEN 'pending_approval' THEN
      PERFORM public.notify_send(NEW.consumer_id, 'wash_completed', v_order_data);

    -- pending_approval → completed (agent approval): notify washer
    WHEN 'completed' THEN
      IF NEW.washer_id IS NOT NULL THEN
        PERFORM public.notify_send(NEW.washer_id, 'order_approved', v_order_data);
      END IF;

    -- * → cancelled: branch on cancelled_by × washer_id
    WHEN 'cancelled' THEN
      IF NEW.cancelled_by IS NULL THEN
        -- Legacy row (pre-migration) or system call with no auth.uid() role.
        -- No notification sent; trigger warning is logged by notify_send's
        -- null-guard if the setting is missing, so just return silently here.
        RAISE WARNING 'notify_on_order_change: order % cancelled with NULL cancelled_by — skipping notification', NEW.id;

      ELSIF NEW.cancelled_by = 'consumer' THEN
        -- Consumer cancelled: notify washer only if washer was already assigned.
        IF NEW.washer_id IS NOT NULL THEN
          PERFORM public.notify_send(NEW.washer_id, 'customer_cancelled', v_order_data);
        END IF;
        -- If washer_id IS NULL, no one to notify.

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
      -- in_progress and other intermediate states: no notification
      NULL;

  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_order_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_order_change();

-- ── Trigger: order_messages insert (direct chat) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_order_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order       public.orders%ROWTYPE;
  v_recipient   UUID;
  v_route       TEXT;
  v_preview     TEXT;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Recipient is the other party on the order
  IF NEW.sender_id = v_order.consumer_id THEN
    -- Consumer sent → notify washer
    v_recipient := v_order.washer_id;
    v_route     := '/washer/job/' || NEW.order_id::TEXT;
  ELSE
    -- Washer sent → notify consumer
    v_recipient := v_order.consumer_id;
    v_route     := '/order/' || NEW.order_id::TEXT;
  END IF;

  IF v_recipient IS NULL THEN RETURN NEW; END IF;

  -- Truncate body for notification preview (max 80 chars)
  v_preview := LEFT(NEW.body, 80);

  PERFORM public.notify_send(
    v_recipient,
    'new_chat_message',
    jsonb_build_object(
      'order_id', NEW.order_id::TEXT,
      'route',    v_route,
      'preview',  v_preview
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_order_message
  AFTER INSERT ON public.order_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_order_message();

-- ── Grants ────────────────────────────────────────────────────────────────────
-- notify_send and the trigger functions are security definer and called by
-- triggers (not directly by clients), so no GRANT TO authenticated is needed.
-- pg_net.http_post is already executable by the trigger function's definer role.
