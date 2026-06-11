-- 0112_backfill_locale_hebrew.sql — Hebrew is the default language, period.
--
-- 0064 changed profiles.locale's DEFAULT to 'he' and backfilled NULLs, but
-- left rows that were created under 0007's old DEFAULT 'en' — including the
-- five seed test accounts. Logging into any of them flips the whole device
-- to English: AuthContext.syncLocale adopts profile.locale and persists it
-- to localStorage, so even the logged-out landing page stays English.
--
-- Backfill those legacy rows to 'he'. Anyone who genuinely prefers English
-- self-heals: an explicit device-side choice (localStorage) wins over the
-- profile in syncLocale and is written back on next login.

UPDATE public.profiles SET locale = 'he' WHERE locale = 'en';
