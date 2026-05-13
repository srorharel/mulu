create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  sender_role text not null check (sender_role in ('consumer', 'washer', 'agent', 'system')),
  body text null,
  -- Image attachment (path in support-attachments bucket)
  attachment_path text null,
  -- Constraint: must have body or attachment
  created_at timestamptz not null default now(),
  check (body is not null or attachment_path is not null)
);

create index idx_support_messages_conv on public.support_messages(conversation_id, created_at);

-- Trigger: when a message is inserted, bump conversation.last_message_at and updated_at,
-- and transition pending_agent → assigned if an agent replies.
create or replace function public.bump_conversation_on_message() returns trigger as $$
begin
  update public.support_conversations
     set last_message_at = new.created_at,
         updated_at = now(),
         status = case
           when status = 'pending_agent' and new.sender_role = 'agent' then 'assigned'
           when status = 'resolved' then 'assigned' -- reopened by either side
           else status
         end,
         assigned_agent_id = case
           when assigned_agent_id is null and new.sender_role = 'agent' then new.sender_id
           else assigned_agent_id
         end
   where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_bump_conversation_on_message
  after insert on public.support_messages
  for each row execute function public.bump_conversation_on_message();
