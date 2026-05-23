-- 0056_realtime_reensure.sql
--
-- Idempotent re-ensure that support_messages, support_conversations, and orders
-- are in the supabase_realtime publication. Migration 0015 did this originally,
-- but may have been bootstrapped (recorded without executing) or missed on some
-- DB environments. Re-running is safe — each block checks before altering.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname    = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname    = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'support_conversations'
  ) then
    alter publication supabase_realtime add table public.support_conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname    = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
