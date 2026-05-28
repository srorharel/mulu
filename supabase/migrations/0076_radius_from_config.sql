-- Migration 0076: find_nearby_washers_for_order reads radius from app_config.
--
-- The Edge Function continues to pass an explicit radius when its
-- NEARBY_JOB_RADIUS_METERS env var is set; when omitted (NULL), the RPC
-- COALESCEs to app_config.nearby_job_radius_meters, then to the hardcoded
-- 15000 default. Behavior preserves the existing pattern exactly.
--
-- Strict superset of the 0066 function shape; CREATE OR REPLACE is safe
-- because the RETURNS TABLE shape is unchanged (washer_id uuid, dist_m double).

CREATE OR REPLACE FUNCTION public.find_nearby_washers_for_order(
  p_order_id uuid,
  p_radius_m double precision DEFAULT NULL
)
RETURNS TABLE (washer_id uuid, dist_m double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
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
    AND ST_DWithin(
          p.current_location::geography,
          o.location::geography,
          COALESCE(p_radius_m, public.get_config_number('nearby_job_radius_meters', 15000))::double precision
        )
    AND p.id NOT IN (
          SELECT own.washer_id
          FROM   public.order_washer_notifications own
          WHERE  own.order_id = p_order_id
        )
    AND NOT EXISTS (
      SELECT 1 FROM public.orders o2
       WHERE o2.washer_id = p.id
         AND o2.status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
    )
  ORDER BY dist_m ASC;
$$;

GRANT EXECUTE ON FUNCTION public.find_nearby_washers_for_order(uuid, double precision)
  TO authenticated;
