-- Migration 0041: Saved vehicles.
--
-- Adds the vehicles table (consumer-owned, multi-vehicle, one default),
-- a nullable vehicle_id FK on orders, a DB trigger that auto-defaults the
-- first vehicle saved per consumer, a set_default_vehicle() RPC, and an
-- update to the orders consumer-INSERT RLS policy to prevent spoofing a
-- vehicle owned by a different consumer.

-- ── vehicles table ────────────────────────────────────────────────────────────

CREATE TABLE public.vehicles (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumer_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plate        TEXT        NOT NULL,
  nickname     TEXT        NOT NULL,
  make         TEXT,
  model        TEXT,
  year         INTEGER,
  color        TEXT,
  category     TEXT        CHECK (category IN ('private', 'jeep', 'pickup')),
  is_default   BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce at most one default per consumer at the DB level.
CREATE UNIQUE INDEX vehicles_one_default_per_consumer
  ON public.vehicles (consumer_id)
  WHERE is_default = true;

CREATE INDEX vehicles_consumer_id_idx     ON public.vehicles (consumer_id);
CREATE INDEX vehicles_consumer_default_idx ON public.vehicles (consumer_id, is_default);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicles: consumer reads own"
  ON public.vehicles FOR SELECT TO authenticated
  USING (consumer_id = auth.uid());

CREATE POLICY "vehicles: consumer inserts own"
  ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (consumer_id = auth.uid());

CREATE POLICY "vehicles: consumer updates own"
  ON public.vehicles FOR UPDATE TO authenticated
  USING  (consumer_id = auth.uid())
  WITH CHECK (consumer_id = auth.uid());

CREATE POLICY "vehicles: consumer deletes own"
  ON public.vehicles FOR DELETE TO authenticated
  USING (consumer_id = auth.uid());

-- ── Auto-default trigger ───────────────────────────────────────────────────────
-- If the consumer has no existing default, auto-set this vehicle as default.
-- Fires BEFORE INSERT so the initial value in NEW can be overridden cleanly.

CREATE OR REPLACE FUNCTION public.vehicles_auto_default()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE consumer_id = NEW.consumer_id AND is_default = true
  ) THEN
    NEW.is_default := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicles_auto_default_trg
  BEFORE INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_auto_default();

-- ── set_default_vehicle RPC ────────────────────────────────────────────────────
-- Atomically clears the old default and sets the new one for the calling consumer.
-- SECURITY DEFINER so the two UPDATEs run in the same implicit transaction as the
-- function body, with explicit ownership validation inside.

CREATE OR REPLACE FUNCTION public.set_default_vehicle(p_vehicle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = p_vehicle_id AND consumer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Vehicle not found or not owned by current user';
  END IF;

  -- Clear any existing default for this consumer.
  UPDATE public.vehicles
    SET is_default = false
    WHERE consumer_id = auth.uid() AND is_default = true AND id <> p_vehicle_id;

  -- Set the new default.
  UPDATE public.vehicles
    SET is_default = true
    WHERE id = p_vehicle_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_default_vehicle(uuid) TO authenticated;

-- ── orders.vehicle_id FK ──────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- ── Update orders consumer-INSERT RLS policy ──────────────────────────────────
-- The original policy only checked consumer_id = auth.uid(). Adding a guard so
-- a consumer cannot supply a vehicle_id belonging to a different user.

DROP POLICY IF EXISTS "orders: consumer insert" ON public.orders;

CREATE POLICY "orders: consumer insert"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    consumer_id = auth.uid()
    AND (
      vehicle_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id = vehicle_id AND v.consumer_id = auth.uid()
      )
    )
  );

NOTIFY pgrst, 'reload schema';
