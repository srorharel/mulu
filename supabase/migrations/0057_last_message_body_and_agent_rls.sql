-- 0057_last_message_body_and_agent_rls.sql
--
-- 1. Add last_message_body to support_conversations for queue preview.
-- 2. Trigger keeps it in sync on every support_messages INSERT.
-- 3. Backfill existing conversations.
-- 4. RLS: allow any authenticated user to read agent profile rows so that
--    consumers/washers can see the assigned agent's display name via the
--    FK embed in useSupportConversation.

-- 1. Column
alter table public.support_conversations
  add column if not exists last_message_body text;

-- 2. Trigger function
create or replace function public.update_conversation_last_message()
returns trigger language plpgsql security definer as $$
begin
  update public.support_conversations
    set last_message_body = new.body,
        last_message_at   = new.created_at
  where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_update_conversation_last_message on public.support_messages;
create trigger trg_update_conversation_last_message
  after insert on public.support_messages
  for each row execute function public.update_conversation_last_message();

-- 3. Backfill: set last_message_body from the most-recent message per conversation
update public.support_conversations c
set last_message_body = m.body,
    last_message_at   = m.created_at
from (
  select distinct on (conversation_id)
    conversation_id, body, created_at
  from public.support_messages
  order by conversation_id, created_at desc
) m
where m.conversation_id = c.id;

-- 4. RLS: let any authenticated user read agent profiles
--    (needed so consumers/washers can see who claimed their support conversation)
drop policy if exists "Anyone can read agent display names" on public.profiles;
create policy "Anyone can read agent display names"
  on public.profiles for select
  using (role = 'agent');
