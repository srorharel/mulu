-- Category-based pricing for service_type = 'wash'.
-- jeep orders:    base=80, platform=40, total=120
-- pickup orders:  base=90, platform=40, total=130
-- all others:     base=60, platform=40, total=100  (private / sedan / suv / van / null)
--
-- Legacy non-'wash' branches from migration 0018 are preserved verbatim.

CREATE OR REPLACE FUNCTION public.validate_order_prices()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_base numeric(10, 2);
  v_fee  numeric(10, 2);
BEGIN
  IF NEW.service_type = 'wash' THEN
    IF NEW.car_type = 'jeep' THEN
      NEW.base_price   := 80.00;
      NEW.platform_fee := 40.00;
      NEW.total_price  := 120.00;
    ELSIF NEW.car_type = 'pickup' THEN
      NEW.base_price   := 90.00;
      NEW.platform_fee := 40.00;
      NEW.total_price  := 130.00;
    ELSE
      -- private / sedan / suv / van / null / any unrecognized value
      NEW.base_price   := 60.00;
      NEW.platform_fee := 40.00;
      NEW.total_price  := 100.00;
    END IF;
    RETURN NEW;
  END IF;

  -- Legacy pricing for non-'wash' service types — verbatim from migration 0018.
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
    RAISE EXCEPTION 'Unknown car_type/service_type combination: %/%',
      NEW.car_type, NEW.service_type;
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

-- Expand car_type CHECK to include the new pricing categories alongside legacy values.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_car_type_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_car_type_check
  CHECK (car_type IS NULL OR car_type = ANY (ARRAY[
    'sedan', 'suv', 'van', 'pickup',   -- legacy values (existing orders)
    'private', 'jeep'                   -- new pricing categories
  ]));
