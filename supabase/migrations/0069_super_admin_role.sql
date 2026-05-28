-- Migration 0069: super_admin role + drop the inert is_admin() helper.
--
-- Adds 'super_admin' to profiles_role_check.
-- Creates public.is_super_admin() mirroring is_agent() from 0014.
-- Drops the inert public.is_admin() helper (zero callers in source as of
-- 2026-05-28) and the two policies that referenced it. is_admin() was
-- added in 0027 to break a recursion bug; the 'admin' role was never added
-- to the constraint, so both fn and policies have been dead code.
--
-- Pre-flight run before applying this migration confirmed
--   SELECT DISTINCT role FROM profiles
-- returned only ('consumer','washer','agent'), so the new constraint accepts
-- every existing row.

BEGIN;

-- 1. Drop the inert admin policies (they reference is_admin())
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all orders"   ON public.orders;

-- 2. Drop the inert helper itself
DROP FUNCTION IF EXISTS public.is_admin();

-- 3. Extend the role check constraint to allow 'super_admin'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('consumer', 'washer', 'agent', 'super_admin'));

-- 4. is_super_admin() — security-definer membership check (mirrors is_agent)
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

COMMIT;
