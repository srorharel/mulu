-- ── Push notification: washer tier changed ────────────────────────────────────
-- Fires when current_tier on a washer's profile row changes.
-- current_tier is an integer 1–5 (higher = better). Null = unrated.
--
-- Guards (all must pass):
--   1. NEW.current_tier IS DISTINCT FROM OLD.current_tier — actual change only
--   2. OLD.current_tier IS NOT NULL — skip initial NULL→integer assignment
--   3. NEW.current_tier IS NOT NULL — skip integer→NULL (tier lost below rating gate)
--
-- Payout is computed inline from the new tier using the same mapping as
-- payout_for_tier() (migration 0032). If payout amounts change in the future,
-- update the CASE statement here in a new migration — Edge Function is untouched.
--
-- Payload fields:
--   old_tier       int    — previous tier value
--   new_tier       int    — new tier value
--   direction      text   — 'promoted' | 'demoted'
--   payout_amount  int    — payout per wash in ILS at new tier
--   route          text   — deep link for notification tap

CREATE OR REPLACE FUNCTION public.notify_on_tier_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout    INT;
  v_direction TEXT;
BEGIN
  -- Guard 1: tier must actually change
  IF NEW.current_tier IS NOT DISTINCT FROM OLD.current_tier THEN RETURN NEW; END IF;

  -- Guard 2: skip initial assignment (NULL → integer)
  IF OLD.current_tier IS NULL THEN RETURN NEW; END IF;

  -- Guard 3: skip tier-lost transition (integer → NULL)
  IF NEW.current_tier IS NULL THEN RETURN NEW; END IF;

  -- Direction
  v_direction := CASE
    WHEN NEW.current_tier > OLD.current_tier THEN 'promoted'
    ELSE 'demoted'
  END;

  -- Payout at new tier — mirrors payout_for_tier() in 0032
  v_payout := CASE NEW.current_tier
    WHEN 1 THEN 40
    WHEN 2 THEN 45
    WHEN 3 THEN 50
    WHEN 4 THEN 55
    WHEN 5 THEN 60
    ELSE       50
  END;

  PERFORM public.notify_send(
    NEW.id,
    'tier_changed',
    jsonb_build_object(
      'old_tier',       OLD.current_tier,
      'new_tier',       NEW.current_tier,
      'direction',      v_direction,
      'payout_amount',  v_payout,
      'route',          '/washer/earnings'
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_tier_change
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_tier_change();
