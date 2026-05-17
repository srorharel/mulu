-- Fix infinite-recursion 500 errors caused by migration 0020's agent policies.
--
-- Root cause: "Agents can read all profiles" queries public.profiles from within
-- a public.profiles SELECT policy — identical to the admin bug fixed in 0027.
-- PostgreSQL detects this as infinite recursion and raises a 500 on every profile
-- fetch, which propagates to any query that joins profiles (including the approvals
-- queue). The error is swallowed by the frontend, producing a silent empty list.
--
-- Fix: drop both broken policies and recreate them using the existing is_agent()
-- SECURITY DEFINER helper from migration 0014, which bypasses RLS safely.

DROP POLICY IF EXISTS "Agents can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Agents can read all orders"   ON public.orders;

CREATE POLICY "Agents can read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_agent());

CREATE POLICY "Agents can read all orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.is_agent());
