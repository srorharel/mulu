-- ── Rename sound identifier 'default' → 'chirp' ─────────────────────────────
-- 'default' is a reserved Java keyword. Android generates R.raw.<filename>
-- constants from res/raw/ files, so a file named default.mp3 causes a build
-- failure at the mergeDebugResources step.
--
-- Correct order:
--   1. Drop old CHECK constraint (which allows 'default', rejects 'chirp')
--   2. Migrate data: 'default' → 'chirp'
--   3. Update column DEFAULT
--   4. Add new CHECK constraint (which allows 'chirp', rejects 'default')

-- 1. Drop old constraint first so the UPDATE in step 2 is not blocked
ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_sound_check;

-- 2. Migrate data (no constraint active during this update)
UPDATE public.notification_preferences
   SET sound = 'chirp'
 WHERE sound = 'default';

-- 3. Update column default
ALTER TABLE public.notification_preferences
  ALTER COLUMN sound SET DEFAULT 'chirp';

-- 4. Re-add constraint with corrected value set
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_sound_check
  CHECK (sound IN ('chirp', 'chime', 'bell', 'gentle'));
