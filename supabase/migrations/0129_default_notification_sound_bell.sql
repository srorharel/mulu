-- ── Change default notification sound: 'chirp' → 'bell' (UI label "צפצפה") ───
-- The notification sound picker's default option is now bell ("צפצפה" / "Buzzer").
-- This sets the column default so NEW notification_preferences rows inherit 'bell'.
--
-- No backfill: existing rows keep whatever the user explicitly chose. Only users
-- who never picked a sound (no row yet, or a future insert that omits the column)
-- get the new default. The CHECK constraint already permits 'bell' (migration 0054),
-- so no constraint change is needed.
--
-- Matching changes elsewhere:
--   • client picker pre-selection  → src/components/settings/NotificationsSection.jsx
--   • edge-function fallback        → supabase/functions/send-notification (?? 'bell')

ALTER TABLE public.notification_preferences
  ALTER COLUMN sound SET DEFAULT 'bell';
