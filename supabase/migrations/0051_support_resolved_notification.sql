-- ── Push notification: support conversation resolved or closed ────────────────
-- Fires when an agent transitions a support_conversations row to 'resolved'
-- or 'closed'. Notifies the conversation opener (consumer or washer).
--
-- Uses NEW.opener_id — NOT user_id (that column does not exist on this table).
-- Status is a PostgreSQL ENUM (support_conv_status), so IN comparisons work
-- correctly without casting.
--
-- Guard: only fires on the FIRST transition into a terminal state. If status
-- was already 'resolved' or 'closed' before this UPDATE (e.g. a metadata-only
-- re-save), the trigger returns early — no duplicate notification.

CREATE OR REPLACE FUNCTION public.notify_on_support_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Ignore transitions that don't land on a terminal status
  IF NEW.status NOT IN ('resolved', 'closed') THEN RETURN NEW; END IF;

  -- Ignore if already in a terminal state (avoids duplicate on re-save)
  IF OLD.status IN ('resolved', 'closed') THEN RETURN NEW; END IF;

  PERFORM public.notify_send(
    NEW.opener_id,
    'support_resolved',
    jsonb_build_object(
      'conversation_id', NEW.id::TEXT,
      'route',           '/support',
      'final_status',    NEW.status::TEXT
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_support_resolution
  AFTER UPDATE ON public.support_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_support_resolution();
