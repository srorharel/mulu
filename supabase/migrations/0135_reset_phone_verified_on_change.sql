-- 0135_reset_phone_verified_on_change.sql — phone-verification hardening.
--
-- phone_verified_at (0126) proves ownership of the phone number that received
-- the OTP. Profile.jsx lets users freely edit profiles.phone, and nothing
-- reset the stamp — so a verified user could swap in any number and keep the
-- "verified" badge. Clear the stamp whenever the phone value changes.
-- (verify-otp now also refuses to stamp when the challenge phone no longer
-- matches the profile phone — this trigger covers the post-verification edit.)

CREATE OR REPLACE FUNCTION public.reset_phone_verified_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone_verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_phone_verified_on_change ON public.profiles;
CREATE TRIGGER trg_reset_phone_verified_on_change
  BEFORE UPDATE OF phone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_phone_verified_on_change();
