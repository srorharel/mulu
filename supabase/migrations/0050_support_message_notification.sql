-- ── Push notification: agent → user support message ──────────────────────────
-- Fires when an agent (or system) inserts a support_messages row.
-- Notifies the conversation opener (the consumer or washer who started it).
-- Uses the same notify_send helper as order_messages notification.
--
-- Recipient logic:
--   sender_role = 'agent' or 'system' → notify opener_id
--   sender_role = 'consumer' or 'washer' → no notification (agent has no device
--   tokens; the correct shape is still to skip explicitly rather than rely on
--   the no_tokens fallback in the Edge Function)
--
-- Route: '/support' — the main app has no conversation-level sub-route;
-- the support page opens the relevant chat sheet inline from conversation list.

CREATE OR REPLACE FUNCTION public.notify_on_support_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
AS $$
DECLARE
  v_conv   public.support_conversations%ROWTYPE;
  v_preview TEXT;
BEGIN
  -- Only notify when an agent or system sends — not when the user themselves sends
  IF NEW.sender_role NOT IN ('agent', 'system') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_conv FROM public.support_conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Truncate body for notification preview (max 80 chars)
  v_preview := LEFT(COALESCE(NEW.body, ''), 80);

  PERFORM public.notify_send(
    v_conv.opener_id,
    'support_message',
    jsonb_build_object(
      'conversation_id', NEW.conversation_id::TEXT,
      'route',           '/support',
      'preview',         v_preview
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_support_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_support_message();
