-- 0015_realtime_publication.sql
--
-- WHY THIS EXISTS
-- Supabase Realtime is opt-in per table: only tables explicitly added to the
-- supabase_realtime publication broadcast postgres_changes events to subscribers.
-- Tables created by raw SQL migrations (0001-0014) were never added to the
-- publication, leaving every client-side Realtime subscription silently receiving
-- no events despite connecting successfully.
--
-- WHAT THIS FIXES
-- This was a latent bug affecting:
--   • orders           → useRealtimeOrder (consumer order status, washer job drawer)
--   • orders           → useNearbyJobs (washer live job list)
--   • support_messages → useSupportConversation / useConversationStream (chat)
--   • support_conversations → useSupportUnread / useAgentQueue / useSupportConversation
--
-- TABLES ADDED AND FEATURE MAPPING
--   orders                 main app order tracking (consumer + washer)
--   support_messages       support chat message delivery (both apps)
--   support_conversations  support queue refresh + unread badge (both apps)
--
-- IDEMPOTENCY
-- Each block checks pg_publication_tables before altering, so this migration is
-- safe to re-run and will no-op for any table already in the publication.

do $$
begin
  -- orders: consumed by useRealtimeOrder (UPDATE filter by id) and
  --         useNearbyJobs (INSERT/UPDATE/DELETE filter by status=pending)
  if not exists (
    select 1 from pg_publication_tables
    where pubname    = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  -- support_messages: consumed by useSupportConversation (main app, INSERT filter
  --   by conversation_id) and useConversationStream (agent app, same filter)
  if not exists (
    select 1 from pg_publication_tables
    where pubname    = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;

  -- support_conversations: consumed by useSupportConversation (UPDATE filter by id),
  --   useSupportUnread (all events, main app unread badge), and
  --   useAgentQueue (all events, agent queue refresh)
  if not exists (
    select 1 from pg_publication_tables
    where pubname    = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'support_conversations'
  ) then
    alter publication supabase_realtime add table public.support_conversations;
  end if;
end $$;
