-- ── New-job-nearby push notification — fan-out architecture ──────────────────
--
-- Architecture (one event, many recipients):
--   1. Consumer inserts a new order (status='pending')
--   2. AFTER INSERT trigger fires notify_on_new_order()
--   3. Trigger makes ONE pg_net call to the fan-out-nearby-job Edge Function
--   4. Edge Function runs the spatial query, finds eligible online washers
--   5. Edge Function calls send-notification once per washer
--
-- This migration creates:
--   • order_washer_notifications  — dedup table (one row per notified washer/order pair)
--   • find_nearby_washers_for_order() — spatial RPC called by the Edge Function
--   • notify_on_new_order()  — trigger function (fires the single pg_net call)
--   • trg_notify_on_new_order  — AFTER INSERT trigger on orders
--
-- Prerequisites (run once after deployment, not in this migration):
--   INSERT vault secret 'fan_out_nearby_job_url' =
--     'https://<project-ref>.supabase.co/functions/v1/fan-out-nearby-job'
--   supabase secrets set NEARBY_JOB_RADIUS_METERS=15000
--   supabase secrets set TRIGGER_SECRET=<service-role-key>  (already set)
--
-- Re-notification suppression: order_washer_notifications tracks which washers
-- have already been notified for a given order. If the fan-out function is
-- ever called twice (e.g. due to a retry), only the first call sends notifications.
-- The find_nearby_washers_for_order() function excludes already-notified washers.

-- ── 1. Dedup table ────────────────────────────────────────────────────────────

CREATE TABLE public.order_washer_notifications (
  order_id    uuid        NOT NULL REFERENCES public.orders(id)   ON DELETE CASCADE,
  washer_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, washer_id)
);

-- Index on order_id for the NOT IN subquery in find_nearby_washers_for_order
CREATE INDEX order_washer_notifications_order_id_idx
  ON public.order_washer_notifications(order_id);

ALTER TABLE public.order_washer_notifications ENABLE ROW LEVEL SECURITY;
-- No authenticated-user policies — service role (Edge Function) only.

-- ── 2. Spatial helper called by the fan-out Edge Function ─────────────────────

CREATE OR REPLACE FUNCTION public.find_nearby_washers_for_order(
  p_order_id uuid,
  p_radius_m double precision DEFAULT 15000
)
RETURNS TABLE (washer_id uuid, dist_m double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id                                                                            AS washer_id,
    ST_Distance(p.current_location::geography, o.location::geography)::double precision AS dist_m
  FROM public.profiles p
  JOIN public.orders   o ON o.id = p_order_id
  WHERE p.role                = 'washer'
    AND p.is_online            = true
    AND p.current_location    IS NOT NULL
    AND ST_DWithin(p.current_location::geography, o.location::geography, p_radius_m)
    AND p.id NOT IN (
          SELECT own.washer_id
          FROM   public.order_washer_notifications own
          WHERE  own.order_id = p_order_id
        )
  ORDER BY dist_m ASC;
$$;

-- Authenticated call-through needed because the Edge Function creates a Supabase
-- client with the service-role key, which still requires EXECUTE on the function.
GRANT EXECUTE ON FUNCTION public.find_nearby_washers_for_order(uuid, double precision)
  TO authenticated;

-- ── 3. Trigger function — fires ONE pg_net call to the fan-out Edge Function ──

CREATE OR REPLACE FUNCTION public.notify_on_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  -- Only fan-out for brand-new pending orders
  IF NEW.status != 'pending' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'fan_out_nearby_job_url' LIMIT 1;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'notify_on_new_order: Vault secrets fan_out_nearby_job_url or service_role_key not found — skipping';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('order_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- pg_net failure must never abort the order INSERT
  RAISE WARNING 'notify_on_new_order: net.http_post failed (non-blocking): %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ── 4. Trigger on orders INSERT ───────────────────────────────────────────────

CREATE TRIGGER trg_notify_on_new_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_order();
