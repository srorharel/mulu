-- Migration 0097: nearby_jobs DROP-before-CREATE heal (audit CRITICAL #2)
--
-- ADR-030 (heal): 0004_features.sql:64 and 0005_nearby_jobs_coords.sql:6 each do
-- `CREATE OR REPLACE FUNCTION public.nearby_jobs(...)` with a CHANGED `RETURNS
-- TABLE` shape and NO preceding `DROP FUNCTION`. PostgreSQL rejects that with
-- `42P13: cannot change return type of existing function`, so a genuinely fresh
-- `0001→…` migrate aborts at 0004. Production only avoided this because the early
-- migrations were `--bootstrap`-recorded (never executed in order).
--
-- Per the project rule we do NOT rewrite 0004/0005. This heal re-establishes the
-- canonical CURRENT definition idempotently (DROP the exact signature, then
-- recreate), matching the 0067/0068 heal pattern, so:
--   • the live/bootstrapped DB is pinned to the correct 13-column shape, and
--   • this becomes the authoritative latest definition the CI contract guard
--     (src/__tests__/nearbyJobsShape.contract.test.js) reads.
--
-- ⚠️ NOTE: a heal at 0097 CANNOT prevent the mid-sequence 0004 abort on a
-- from-empty database — the runner halts at 0004 long before reaching here. The
-- only true fix for a fresh-from-scratch deploy is adding `DROP FUNCTION IF
-- EXISTS public.nearby_jobs(float, float, int);` before the CREATE in 0004 AND
-- 0005, which is out of scope here (don't-rewrite-old-migrations).
--
-- Definition is a verbatim copy of 0066's nearby_jobs (13 cols incl. lat/lng via
-- ST_Y/ST_X, busy-washer exclusion per ADR-024) — a strict superset of the live
-- shape. lat/lng MUST stay (WorkerMap.jsx renders job pins from them).
-- No inner BEGIN/COMMIT: the runner wraps each file in one transaction, so the
-- DROP + CREATE already roll back atomically on failure (audit finding #7).

DROP FUNCTION IF EXISTS public.nearby_jobs(double precision, double precision, integer);

CREATE OR REPLACE FUNCTION public.nearby_jobs(
  washer_lat float,
  washer_lng float,
  radius_km  int default 15
)
RETURNS TABLE (
  id              uuid,
  consumer_id     uuid,
  car_type        text,
  service_type    text,
  address_label   text,
  base_price      numeric,
  platform_fee    numeric,
  total_price     numeric,
  status          text,
  created_at      timestamptz,
  distance_km     float,
  lat             float,
  lng             float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    o.id,
    o.consumer_id,
    o.car_type,
    o.service_type,
    o.address_label,
    o.base_price,
    o.platform_fee,
    o.total_price,
    o.status,
    o.created_at,
    round(
      (ST_Distance(
        o.location::geography,
        ST_SetSRID(ST_MakePoint(washer_lng, washer_lat), 4326)::geography
      ) / 1000.0)::numeric,
      2
    )::float                          as distance_km,
    ST_Y(o.location::geometry)::float as lat,
    ST_X(o.location::geometry)::float as lng
  FROM public.orders o
  WHERE
    o.status = 'pending'
    AND ST_DWithin(
      o.location::geography,
      ST_SetSRID(ST_MakePoint(washer_lng, washer_lat), 4326)::geography,
      radius_km * 1000.0
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'washer' AND is_online = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.orders o2
       WHERE o2.washer_id = auth.uid()
         AND o2.status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
    )
  ORDER BY distance_km ASC;
$$;

GRANT EXECUTE ON FUNCTION public.nearby_jobs(float, float, int) TO authenticated;
