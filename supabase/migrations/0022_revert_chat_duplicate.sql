-- Drop the duplicate chat infrastructure from migration 0021.
-- The existing support_conversations / support_messages system handles
-- washer-agent chat via opener_role = 'washer'. These tables were redundant.

DROP TRIGGER  IF EXISTS trg_touch_thread_on_message ON public.chat_messages;
DROP FUNCTION IF EXISTS public.touch_thread_on_message();
DROP FUNCTION IF EXISTS public.ensure_chat_thread(uuid);

DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_threads  CASCADE;

-- Remove from realtime publication (ignore if already absent).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_threads;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_messages;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END $$;

-- Keep last_lat, last_lng, last_location_at on profiles — still used by
-- the approvals UI in support-app to show where the washer was when they
-- submitted a job.
-- Keep profiles in the realtime publication for the same reason.
