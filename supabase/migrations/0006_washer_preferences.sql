-- ── Washer display + notification + navigation preferences ───────────────────
-- Three new opt-in columns on profiles. All have sensible defaults so no
-- existing row violates NOT NULL or CHECK constraints.

alter table public.profiles
  add column if not exists ringtone_preference text    default 'default',
  add column if not exists display_preference  text    default 'dark'  check (display_preference  in ('dark',  'light')),
  add column if not exists nav_app_preference  text    default 'waze'  check (nav_app_preference   in ('waze',  'google'));
