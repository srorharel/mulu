-- Ensure orders.decline_count exists.
--
-- 0066_approval_lifecycle.sql already adds this column, but a bootstrap run
-- (see CLAUDE.md "Bootstrap warning") can record 0066 as applied without
-- executing its SQL. This idempotent migration heals that state so the
-- support-app Approvals query (which selects decline_count) stops crashing
-- with "column orders.decline_count does not exist".

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS decline_count int NOT NULL DEFAULT 0;
