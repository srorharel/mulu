-- Migration 0078: pricing_config + payout_tier_config + dual-path
-- validate_order_prices / payout_for_tier / recompute_washer_tier.
--
-- The functions branch on app_config.pricing_source:
--   'hardcoded' → existing CASE statements (unchanged behavior)
--   'config'    → lookup from pricing_config + payout_tier_config
--
-- The seed values in pricing_config and payout_tier_config are EXACT mirrors
-- of the hardcoded values from 0024_category_pricing.sql + 0032_ratings_and_payout_tiers.sql.
-- Both code paths must return identical results for every input — verify-db
-- asserts this parity. The seeded `pricing_source = 'hardcoded'` in 0075
-- stays as-is in this commit; a human flips it after independent verification.

BEGIN;

-- ── 1. pricing_config (category → consumer/worker/platform) ─────────────────
CREATE TABLE IF NOT EXISTS public.pricing_config (
  category       text         PRIMARY KEY,
  consumer_price numeric(10,2) NOT NULL,
  worker_price   numeric(10,2) NOT NULL,
  platform_fee   numeric(10,2) NOT NULL,
  updated_at     timestamptz   NOT NULL DEFAULT now(),
  updated_by     uuid          REFERENCES public.profiles(id)
);

ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_config anon read" ON public.pricing_config;
CREATE POLICY "pricing_config anon read"
  ON public.pricing_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "pricing_config super_admin write" ON public.pricing_config;
CREATE POLICY "pricing_config super_admin write"
  ON public.pricing_config FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Seed with EXACT current hardcoded values from 0024.
INSERT INTO public.pricing_config (category, consumer_price, worker_price, platform_fee) VALUES
  ('private', 100, 60, 40),
  ('jeep',    120, 80, 40),
  ('pickup',  130, 90, 40)
ON CONFLICT (category) DO NOTHING;

-- ── 2. payout_tier_config (tier → payout) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_tier_config (
  tier         int           PRIMARY KEY CHECK (tier BETWEEN 1 AND 5),
  payout       numeric(10,2) NOT NULL,
  updated_at   timestamptz   NOT NULL DEFAULT now(),
  updated_by   uuid          REFERENCES public.profiles(id)
);

ALTER TABLE public.payout_tier_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout_tier_config anon read" ON public.payout_tier_config;
CREATE POLICY "payout_tier_config anon read"
  ON public.payout_tier_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "payout_tier_config super_admin write" ON public.payout_tier_config;
CREATE POLICY "payout_tier_config super_admin write"
  ON public.payout_tier_config FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

INSERT INTO public.payout_tier_config (tier, payout) VALUES
  (1, 40), (2, 45), (3, 50), (4, 55), (5, 60)
ON CONFLICT (tier) DO NOTHING;

-- Realtime so the admin sees other editors' changes live.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='pricing_config') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pricing_config;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='payout_tier_config') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payout_tier_config;
  END IF;
END $$;

-- ── 3. validate_order_prices — dual-path ────────────────────────────────────
-- Reads pricing_source from app_config. 'hardcoded' uses the same CASE as 0024.
-- 'config' joins pricing_config; falls back to the hardcoded value if the
-- category row is missing.

CREATE OR REPLACE FUNCTION public.validate_order_prices()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_base   numeric(10, 2);
  v_fee    numeric(10, 2);
  v_source text;
  v_row    public.pricing_config%ROWTYPE;
BEGIN
  -- Only the new 'wash' service uses the dual-path branch.
  IF NEW.service_type = 'wash' THEN
    v_source := public.get_config_text('pricing_source', 'hardcoded');

    IF v_source = 'config' THEN
      SELECT * INTO v_row FROM public.pricing_config
        WHERE category = COALESCE(NEW.car_type, 'private');
      IF FOUND THEN
        NEW.base_price   := v_row.worker_price;
        NEW.platform_fee := v_row.platform_fee;
        NEW.total_price  := v_row.consumer_price;
        RETURN NEW;
      END IF;
      -- Fall through to hardcoded if config row missing.
    END IF;

    -- Hardcoded path — same as 0024_category_pricing.sql.
    IF NEW.car_type = 'jeep' THEN
      NEW.base_price   := 80.00;
      NEW.platform_fee := 40.00;
      NEW.total_price  := 120.00;
    ELSIF NEW.car_type = 'pickup' THEN
      NEW.base_price   := 90.00;
      NEW.platform_fee := 40.00;
      NEW.total_price  := 130.00;
    ELSE
      NEW.base_price   := 60.00;
      NEW.platform_fee := 40.00;
      NEW.total_price  := 100.00;
    END IF;
    RETURN NEW;
  END IF;

  -- Legacy non-'wash' service types — preserved verbatim from 0024.
  v_base := CASE
    WHEN NEW.car_type = 'sedan'  AND NEW.service_type = 'exterior' THEN  60.00
    WHEN NEW.car_type = 'sedan'  AND NEW.service_type = 'interior' THEN  70.00
    WHEN NEW.car_type = 'sedan'  AND NEW.service_type = 'full'     THEN 110.00
    WHEN NEW.car_type = 'suv'    AND NEW.service_type = 'exterior' THEN  75.00
    WHEN NEW.car_type = 'suv'    AND NEW.service_type = 'interior' THEN  85.00
    WHEN NEW.car_type = 'suv'    AND NEW.service_type = 'full'     THEN 130.00
    WHEN NEW.car_type = 'pickup' AND NEW.service_type = 'exterior' THEN  80.00
    WHEN NEW.car_type = 'pickup' AND NEW.service_type = 'interior' THEN  90.00
    WHEN NEW.car_type = 'pickup' AND NEW.service_type = 'full'     THEN 140.00
    WHEN NEW.car_type = 'van'    AND NEW.service_type = 'exterior' THEN  90.00
    WHEN NEW.car_type = 'van'    AND NEW.service_type = 'interior' THEN 100.00
    WHEN NEW.car_type = 'van'    AND NEW.service_type = 'full'     THEN 160.00
    ELSE NULL
  END;
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'Unknown car_type/service_type combination: %/%', NEW.car_type, NEW.service_type;
  END IF;
  v_base := v_base
    + CASE WHEN COALESCE(NEW.addon_wiper_fluid,   false) THEN 20.00 ELSE 0.00 END
    + CASE WHEN COALESCE(NEW.addon_tire_pressure, false) THEN 20.00 ELSE 0.00 END;
  v_fee := ROUND((v_base * 0.15)::numeric, 2);
  NEW.base_price   := v_base;
  NEW.platform_fee := v_fee;
  NEW.total_price  := v_base + v_fee;
  RETURN NEW;
END;
$$;

-- ── 4. payout_for_tier — dual-path ──────────────────────────────────────────
-- Cannot stay IMMUTABLE because the body now reads from a table; STABLE is
-- correct for security definer + DML-read.

DROP FUNCTION IF EXISTS public.payout_for_tier(int);

CREATE OR REPLACE FUNCTION public.payout_for_tier(p_tier int)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source text;
  v_payout numeric;
BEGIN
  v_source := public.get_config_text('pricing_source', 'hardcoded');

  IF v_source = 'config' THEN
    SELECT payout INTO v_payout FROM public.payout_tier_config WHERE tier = p_tier;
    IF FOUND THEN RETURN v_payout; END IF;
  END IF;

  -- Hardcoded path — same as 0032.
  RETURN CASE p_tier
    WHEN 1 THEN 40
    WHEN 2 THEN 45
    WHEN 3 THEN 50
    WHEN 4 THEN 55
    WHEN 5 THEN 60
    ELSE       50
  END::numeric;
END;
$$;

GRANT EXECUTE ON FUNCTION public.payout_for_tier(int) TO authenticated;

-- ── 5. recompute_washer_tier — RATING_GATE_JOBS from config ─────────────────
-- The 3-rated-job threshold becomes app_config.rating_gate_jobs with COALESCE
-- to a hardcoded 3. The behavior is identical at the seed value; the admin
-- can adjust freely.

CREATE OR REPLACE FUNCTION public.recompute_washer_tier(p_washer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_avg       numeric;
  v_count     int;
  v_tier      int;
  v_old_tier  int;
  v_gate      int;
BEGIN
  v_gate := public.get_config_number('rating_gate_jobs', 3)::int;

  SELECT count(*) INTO v_count
    FROM public.washer_ratings
   WHERE washer_id = p_washer_id;

  IF v_count < v_gate THEN
    UPDATE public.profiles
       SET current_rating  = NULL,
           current_tier    = NULL,
           rated_job_count = v_count
     WHERE id = p_washer_id;
    RETURN;
  END IF;

  SELECT avg(stars) INTO v_avg
  FROM (
    SELECT stars
      FROM public.washer_ratings
     WHERE washer_id = p_washer_id
     ORDER BY created_at DESC
     LIMIT 20
  ) recent;

  v_tier := greatest(1, least(5, floor(v_avg)::int));

  SELECT current_tier INTO v_old_tier
    FROM public.profiles WHERE id = p_washer_id;

  UPDATE public.profiles
     SET current_rating  = round(v_avg, 2),
         current_tier    = v_tier,
         rated_job_count = v_count,
         tier_changed_at = CASE
           WHEN v_old_tier IS DISTINCT FROM v_tier THEN now()
           ELSE tier_changed_at
         END
   WHERE id = p_washer_id;
END;
$$;

COMMIT;
