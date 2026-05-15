-- Fix infinite-recursion 500 errors caused by migration 0019's admin policies.
--
-- Root cause: "Admins can read all profiles" queries public.profiles from within
-- a public.profiles SELECT policy. PostgreSQL detects this as infinite recursion
-- and raises an error that Supabase surfaces as HTTP 500 on every profile fetch.
--
-- "Admins can read all orders" queries public.profiles from within an orders
-- policy — cross-table, so no recursion — but it used role='admin' which is a
-- dead role in the current app. Dropping it for cleanliness.
--
-- Fix: drop both broken policies. Replace with a SECURITY DEFINER helper
-- (same pattern as is_agent() from migration 0014) so any future admin
-- policy can safely query profiles without triggering RLS.

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all orders"   ON public.orders;

-- Safe helper: runs as definer, bypasses RLS on profiles.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Re-add the policies using the safe helper so they work if an admin user
-- is ever created. No user currently has role='admin' so these are inert.
CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can read all orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.is_admin());
