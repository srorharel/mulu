-- 0133_harden_security_definer_search_path.sql
--
-- Security hardening (audit, Jun 2026): pin `search_path` on the remaining
-- SECURITY DEFINER functions that were still relying on the caller's path, and
-- schema-qualify their object references. A definer function whose object
-- resolution depends on the caller's search_path is the classic privilege-
-- escalation shape — an attacker who can influence search_path (or shadow a
-- referenced table) could redirect the writes the function performs.
--
-- Practical exploitability through PostgREST is low (a single RPC call cannot
-- `SET search_path` or create a shadowing object), but every other definer
-- function in this codebase already sets `search_path = public, pg_temp`. This
-- closes the gap for consistency + defense-in-depth.
--
-- CREATE OR REPLACE keeps each function's signature/return shape unchanged, so
-- dependent policies and triggers are untouched (no DROP needed).

-- ── review_washer_verification (0058) ──────────────────────────────────────────
-- The important one: DEFINER + privileged write (approves washers) + previously
-- UNQUALIFIED table references. Now qualified + search_path pinned.
CREATE OR REPLACE FUNCTION public.review_washer_verification(
  p_verification_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_washer uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agent') THEN
    RAISE EXCEPTION 'agents only';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid decision';
  END IF;

  UPDATE public.washer_verifications
     SET status = p_decision,
         rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_reason ELSE NULL END,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   WHERE id = p_verification_id
  RETURNING washer_id INTO v_washer;

  UPDATE public.profiles
     SET washer_verification_status = p_decision
   WHERE id = v_washer;
END$$;

-- ── is_admin (0027) ─────────────────────────────────────────────────────────────
-- Body already qualified; add search_path for consistency. (Keys off the dead
-- 'admin' role — inert today, but harden anyway.)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── set_default_vehicle (0041) ──────────────────────────────────────────────────
-- Body already qualified; add search_path.
CREATE OR REPLACE FUNCTION public.set_default_vehicle(p_vehicle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = p_vehicle_id AND consumer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Vehicle not found or not owned by current user';
  END IF;

  UPDATE public.vehicles
    SET is_default = false
    WHERE consumer_id = auth.uid() AND is_default = true AND id <> p_vehicle_id;

  UPDATE public.vehicles
    SET is_default = true
    WHERE id = p_vehicle_id;
END;
$$;

-- ── update_conversation_last_message (0057) ─────────────────────────────────────
-- Trigger function; body already qualified. CREATE OR REPLACE leaves the existing
-- trg_update_conversation_last_message trigger bound to it.
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.support_conversations
    SET last_message_body = new.body,
        last_message_at   = new.created_at
  WHERE id = new.conversation_id;
  RETURN new;
END $$;
