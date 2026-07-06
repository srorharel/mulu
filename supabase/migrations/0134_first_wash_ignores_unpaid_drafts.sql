-- 0134_first_wash_ignores_unpaid_drafts.sql — bug fix (ADR-040 × ADR-042).
--
-- Since ADR-042 the order row is inserted as UNPAID 'pending' on the booking
-- tap, and checkout follows. 0111's eligibility check ("no prior non-cancelled
-- order") therefore counted abandoned unpaid checkout drafts — a new user who
-- tapped "ממשיכים לתשלום" once and backed out of checkout silently lost their
-- 30% first-wash discount forever. Every other paid-aware surface (0130's
-- washer gating, 0132's active-order guard, useConsumerActiveOrders) already
-- treats unpaid pending drafts as invisible; this aligns the discount check.
--
-- New predicate: a prior order burns the discount only if it is not an unpaid
-- pending draft — i.e. cancelled orders (as before) AND unpaid drafts are
-- ignored. Known accepted edge: a user who stacks several unpaid drafts and
-- later pays them all gets the discount on each draft priced while no paid
-- order existed; drafts are priced at insert and checkout normally follows
-- immediately, so the exposure is negligible next to silently burning the
-- discount.
--
-- Client mirror updated in src/hooks/useFirstWashDiscount.js (display-only).
-- Same TRIGGER return shape — CREATE OR REPLACE is safe (no DROP needed).
-- Body is 0111's verbatim except the one predicate.

CREATE OR REPLACE FUNCTION public.validate_order_prices()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_base   numeric(10, 2);
  v_fee    numeric(10, 2);
  v_source text;
  v_priced boolean := false;
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
        v_priced := true;
      END IF;
      -- Fall through to hardcoded if config row missing.
    END IF;

    IF NOT v_priced THEN
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
    END IF;

    -- ── First-wash discount (ADR-040) ────────────────────────────────────
    NEW.discount_percent := 0;
    NEW.discount_amount  := 0;

    IF NEW.consumer_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended('first_wash_discount:' || NEW.consumer_id::text, 0)
      );
      IF NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.consumer_id = NEW.consumer_id
          AND o.status <> 'cancelled'
          -- Abandoned unpaid checkout drafts (ADR-042 order-before-payment)
          -- must not burn the discount. Legacy pre-0130 rows have paid_at
          -- NULL but a non-pending status, so they still count.
          AND NOT (o.status = 'pending' AND o.paid_at IS NULL)
      ) THEN
        NEW.discount_percent := 30;
        NEW.discount_amount  := ROUND((NEW.total_price * 0.30)::numeric, 2);
        NEW.total_price      := NEW.total_price  - NEW.discount_amount;
        NEW.platform_fee     := NEW.platform_fee - NEW.discount_amount;
      END IF;
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
