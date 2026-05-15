-- ── 1. Last-known location columns on profiles ───────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_lat          double precision,
  ADD COLUMN IF NOT EXISTS last_lng          double precision,
  ADD COLUMN IF NOT EXISTS last_location_at  timestamptz;

-- ── 2. Chat threads — one per washer ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  washer_id       uuid        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_last_message
  ON public.chat_threads(last_message_at DESC NULLS LAST);

-- ── 3. Chat messages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         uuid        NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_role       text        NOT NULL CHECK (sender_role IN ('washer', 'agent')),
  body              text        NOT NULL CHECK (length(body) > 0 AND length(body) <= 2000),
  created_at        timestamptz NOT NULL DEFAULT now(),
  read_by_washer_at timestamptz,
  read_by_agent_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread
  ON public.chat_messages(thread_id, created_at DESC);

-- ── 4. RLS — chat_threads ────────────────────────────────────────────────────
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Washers can read their own thread"
  ON public.chat_threads FOR SELECT TO authenticated
  USING (washer_id = auth.uid());

CREATE POLICY "Agents can read all threads"
  ON public.chat_threads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agent'));

CREATE POLICY "Washer or agent can create thread"
  ON public.chat_threads FOR INSERT TO authenticated
  WITH CHECK (
    washer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agent')
  );

CREATE POLICY "Washer or agent can update thread"
  ON public.chat_threads FOR UPDATE TO authenticated
  USING (
    washer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agent')
  );

-- ── 5. RLS — chat_messages ───────────────────────────────────────────────────
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Washers can read messages in their thread"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_threads
      WHERE id = chat_messages.thread_id AND washer_id = auth.uid()
    )
  );

CREATE POLICY "Agents can read all messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agent'));

CREATE POLICY "Washers can send to their thread"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id   = auth.uid()
    AND sender_role = 'washer'
    AND EXISTS (
      SELECT 1 FROM public.chat_threads
      WHERE id = chat_messages.thread_id AND washer_id = auth.uid()
    )
  );

CREATE POLICY "Agents can send to any thread"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id   = auth.uid()
    AND sender_role = 'agent'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agent')
  );

CREATE POLICY "Anyone in thread can mark messages read"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_threads
      WHERE id = chat_messages.thread_id
      AND (
        washer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agent')
      )
    )
  );

-- ── 6. Trigger: stamp last_message_at on thread ───────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_thread_on_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.chat_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_thread_on_message ON public.chat_messages;
CREATE TRIGGER trg_touch_thread_on_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_thread_on_message();

-- ── 7. ensure_chat_thread: idempotent thread upsert ──────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_chat_thread(washer_uuid uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_thread_id uuid;
BEGIN
  SELECT id INTO v_thread_id FROM public.chat_threads WHERE washer_id = washer_uuid;
  IF v_thread_id IS NULL THEN
    INSERT INTO public.chat_threads (washer_id) VALUES (washer_uuid) RETURNING id INTO v_thread_id;
  END IF;
  RETURN v_thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_chat_thread(uuid) TO authenticated;

-- ── 8. Realtime publication ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
