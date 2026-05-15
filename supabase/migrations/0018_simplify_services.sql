-- Add access_notes for new booking flow. key_location stays for legacy orders.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS access_notes text;

-- Flat pricing for service_type = 'wash':
--   washer earns  60 ILS (base_price)
--   platform fee  40 ILS (platform_fee)
--   consumer pays 100 ILS (total_price)
-- Legacy service types (exterior/interior/full) keep the old per-type price table
-- so existing orders in progress can still be completed.
CREATE OR REPLACE FUNCTION public.validate_order_prices()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_base numeric(10, 2);
  v_fee  numeric(10, 2);
BEGIN
  IF NEW.service_type = 'wash' THEN
    NEW.base_price   := 60.00;
    NEW.platform_fee := 40.00;
    NEW.total_price  := 100.00;
    RETURN NEW;
  END IF;

  -- Legacy pricing kept verbatim for backward compatibility.
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
