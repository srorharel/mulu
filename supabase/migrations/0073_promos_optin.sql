-- Migration 0073: separate opt-in for promotional broadcasts.
--
-- notification_preferences.enabled is the TRANSACTIONAL toggle (order
-- updates, chat messages, tier changes). Promos / admin broadcasts deserve
-- their own opt-in: legally + UX-wise users should be able to silence
-- promotions without losing transactional alerts.
--
-- Default true matches the established "opt out, not opt in" UX in the app
-- (every existing user is opted into promos by default, can disable in
-- /profile/settings or /washer/settings).
--
-- send-notification short-circuits with error='user_promos_disabled' when
-- event_type='admin_broadcast' and promos_enabled=false.

BEGIN;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS promos_enabled boolean NOT NULL DEFAULT true;

COMMIT;
