-- Migration 0117: consumer tips / gratuity (Washer Terms §6.7).
--
-- A consumer may add a tip to a completed order through the app. The tip is
-- stored SEPARATELY from base_price / platform_fee / total_price — it is the
-- washer's gratuity income, never folded into the wash price — so downstream
-- VAT handling (which depends on the washer's tax status) can treat it on its own.
--
-- VAT itself is intentionally NOT computed here (deferred to the payout/settlement
-- backend). This migration only:
--   * adds orders.tip_amount + orders.tip_added_at (separated from the base price);
--   * adds profiles.washer_tax_status so the later VAT logic has its input
--     (עוסק מורשה collects + self-invoices VAT; עוסק פטור/זעיר has VAT withheld);
--   * exposes add_order_tip() — a consumer-only, completed-order-only writer.
--
-- No inner BEGIN/COMMIT — the runner wraps this file in one transaction.

-- ── Tip columns (separate from base/platform/total price) ─────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tip_amount   numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_added_at timestamptz;

-- ── Washer tax status — input for LATER tip-VAT handling (§6.7) ────────────────
--   osek_murshe = עוסק מורשה (collects VAT, self-invoices)
--   osek_patur  = עוסק פטור  (VAT withheld by the platform)
--   osek_zair   = עוסק זעיר  (treated like patur for tip VAT)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS washer_tax_status text
    CHECK (washer_tax_status IS NULL OR washer_tax_status IN ('osek_murshe', 'osek_patur', 'osek_zair'));

-- ── add_order_tip: consumer-only, completed-order-only ────────────────────────
CREATE OR REPLACE FUNCTION public.add_order_tip(p_order_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_uid   uuid := auth.uid();
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Tip amount must be positive';
  END IF;
  IF p_amount > 1000 THEN
    RAISE EXCEPTION 'Tip amount too large';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF v_order.consumer_id IS NULL OR v_order.consumer_id <> v_uid THEN
    RAISE EXCEPTION 'Only the order owner can add a tip';
  END IF;
  IF v_order.status <> 'completed' THEN
    RAISE EXCEPTION 'Tips can only be added to completed orders';
  END IF;

  UPDATE public.orders SET
    tip_amount   = ROUND(p_amount::numeric, 2),
    tip_added_at = now()
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_order_tip(uuid, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
