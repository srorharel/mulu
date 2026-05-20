-- ── Fix notification_preferences sound constraint ────────────────────────────
-- Problems fixed:
--   1. CHECK constraint allowed ('default','chime','bell','gentle') but the
--      frontend SOUNDS array uses 'chirp' (not 'default'). Picking 'chirp'
--      threw a CHECK violation and was silently rejected, leaving every user
--      with sound = 'default' → OS default sound played on every notification.
--   2. Column default was 'default'; new users inherited the wrong value.
--   3. No INSERT RLS policy — client-side upsert could not create missing rows.

-- Step 1: drop old constraint so backfill doesn't violate it
ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_sound_check;

-- Step 2: backfill existing rows — 'default' → 'chirp'
UPDATE public.notification_preferences
  SET sound = 'chirp'
  WHERE sound = 'default';

-- Step 3: add new constraint with 'chirp' replacing 'default'
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_sound_check
  CHECK (sound IN ('chirp', 'chime', 'bell', 'gentle'));

-- Step 4: update column default to match
ALTER TABLE public.notification_preferences
  ALTER COLUMN sound SET DEFAULT 'chirp';

-- Step 5: INSERT policy so client-side upsert can create missing rows
CREATE POLICY "Users can insert own notification preferences"
  ON public.notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
