-- Migration 0096: profiles column-level write lockdown (audit CRITICAL #1)
--
-- ADR-029 (heal): The 0002 "profiles: update own" policy gates the ROW
-- (auth.uid() = id) but NOT the columns, and there is no column GRANT or guard
-- trigger. Any authenticated user could therefore:
--   • UPDATE profiles SET role = 'super_admin'           → full privilege escalation
--   • UPDATE profiles SET washer_verification_status='approved'
--                                                        → self-approve onboarding,
--                                                          bypassing review_washer_verification
--   • UPDATE profiles SET current_tier=5 / suspended_at=null
--                                                        → forge payout tier / un-suspend self
--
-- A WITH CHECK cannot express this: RLS sees only the NEW row, never OLD, so it
-- cannot pin a column to its existing value. The column guard must be a
-- BEFORE UPDATE trigger (which has OLD + NEW).
--
-- "Keep agent override intact": every legitimate writer of these columns is a
-- SECURITY DEFINER RPC owned by postgres (review_washer_verification,
-- recompute_washer_tier, admin_update_profile, admin_suspend_user, …). Inside a
-- definer function current_user = 'postgres' (or 'service_role' for trusted
-- server scripts), so the guard only constrains DIRECT client updates
-- (current_user = 'authenticated'/'anon'). It additionally lets agents and
-- super_admins through on any path. Net effect: privileged paths are untouched;
-- only a consumer/washer's own direct write is column-restricted.
--
-- Allowed client writes that are preserved:
--   • washer onboarding submit/resubmit may set washer_verification_status to
--     'pending_documents' / 'pending_review' (Verify.jsx) — but NOT approved/rejected.
--
-- Idempotent: DROP POLICY/TRIGGER/FUNCTION IF EXISTS before (re)create.
-- No inner BEGIN/COMMIT: run-migrations.js already wraps each file in one
-- transaction; an inner COMMIT would defeat that (audit finding #7 / 0069).

-- 1. Re-state the row-scoping policy with an explicit WITH CHECK on ownership.
--    (Row scope only — the column pinning lives in the trigger below.)
DROP POLICY IF EXISTS "profiles: update own" ON public.profiles;
CREATE POLICY "profiles: update own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. Column-level guard — the part a policy cannot express (needs OLD vs NEW).
CREATE OR REPLACE FUNCTION public.guard_profiles_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role text;
BEGIN
  -- (a) SECURITY DEFINER RPCs (owned by postgres) and trusted server roles run
  --     as a non-client role — they are the sanctioned writers of these columns.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- (b) Agents / super_admins may override via any path (keeps admin tooling working
  --     even if a future flow updates a profile directly rather than via an RPC).
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IN ('agent', 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- (c) Direct consumer/washer update: pin the protected columns.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'profiles.role cannot be changed directly (admin RPC only)';
  END IF;

  IF NEW.washer_verification_status IS DISTINCT FROM OLD.washer_verification_status
     AND COALESCE(NEW.washer_verification_status, '') NOT IN ('pending_documents', 'pending_review') THEN
    RAISE EXCEPTION 'profiles.washer_verification_status can only be self-set to pending_* (approval is review_washer_verification only)';
  END IF;

  IF NEW.current_tier    IS DISTINCT FROM OLD.current_tier
   OR NEW.current_rating  IS DISTINCT FROM OLD.current_rating
   OR NEW.rated_job_count IS DISTINCT FROM OLD.rated_job_count
   OR NEW.tier_changed_at IS DISTINCT FROM OLD.tier_changed_at THEN
    RAISE EXCEPTION 'profiles tier/rating columns are server-computed (recompute_washer_tier only)';
  END IF;

  IF NEW.suspended_at     IS DISTINCT FROM OLD.suspended_at
   OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
   OR NEW.suspended_by      IS DISTINCT FROM OLD.suspended_by THEN
    RAISE EXCEPTION 'profiles suspension columns are admin-only (admin_suspend_user / admin_unsuspend_user)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_protected_columns ON public.profiles;
CREATE TRIGGER trg_guard_profiles_protected_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_protected_columns();

NOTIFY pgrst, 'reload schema';
