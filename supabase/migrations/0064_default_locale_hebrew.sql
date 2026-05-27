-- Default locale to Hebrew for new profiles and backfill NULLs.
UPDATE profiles SET locale = 'he' WHERE locale IS NULL;
ALTER TABLE profiles ALTER COLUMN locale SET DEFAULT 'he';
