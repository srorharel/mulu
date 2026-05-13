-- Canned responses
create table public.support_canned_responses (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid null references public.profiles(id) on delete cascade, -- null = global
  shortcut text not null, -- e.g. "/eta", "/refund"
  body_he text not null,
  body_en text not null,
  created_at timestamptz not null default now()
);

create index idx_canned_agent on public.support_canned_responses(agent_id);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_canned_responses enable row level security;

-- Helper: is the current user an agent?
create or replace function public.is_agent() returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'agent'
  );
$$ language sql stable security definer;

-- support_conversations policies
create policy "Participants and agents can read conversations"
  on public.support_conversations for select
  using (
    opener_id = auth.uid()
    or counterparty_id = auth.uid()
    or assigned_agent_id = auth.uid()
    or public.is_agent()
  );

create policy "Users can open their own conversations"
  on public.support_conversations for insert
  with check (opener_id = auth.uid() and opener_role in ('consumer', 'washer'));

create policy "Participants and agents can update conversations"
  on public.support_conversations for update
  using (
    opener_id = auth.uid()
    or counterparty_id = auth.uid()
    or assigned_agent_id = auth.uid()
    or public.is_agent()
  );

-- support_messages policies
create policy "Participants can read messages"
  on public.support_messages for select
  using (
    exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id
        and (c.opener_id = auth.uid()
             or c.counterparty_id = auth.uid()
             or c.assigned_agent_id = auth.uid()
             or public.is_agent())
    )
  );

create policy "Participants can send messages"
  on public.support_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id
        and (c.opener_id = auth.uid()
             or c.counterparty_id = auth.uid()
             or c.assigned_agent_id = auth.uid()
             or (public.is_agent() and c.status in ('pending_agent', 'assigned')))
        and c.status != 'closed'
    )
  );

-- canned responses policies
create policy "Agents read own and global canned"
  on public.support_canned_responses for select
  using (public.is_agent() and (agent_id is null or agent_id = auth.uid()));

create policy "Agents manage own canned"
  on public.support_canned_responses for all
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

-- RPC: assign self to a conversation
create or replace function public.claim_conversation(p_conv_id uuid)
returns void as $$
begin
  if not public.is_agent() then
    raise exception 'Only agents can claim conversations';
  end if;

  update public.support_conversations
    set assigned_agent_id = auth.uid(),
        status = 'assigned',
        updated_at = now()
  where id = p_conv_id
    and status in ('pending_agent', 'assigned')
    and (assigned_agent_id is null or assigned_agent_id = auth.uid());
end;
$$ language plpgsql security definer;

-- RPC: release a conversation (back to queue)
create or replace function public.release_conversation(p_conv_id uuid)
returns void as $$
begin
  if not public.is_agent() then
    raise exception 'Only agents can release conversations';
  end if;

  update public.support_conversations
    set assigned_agent_id = null,
        status = 'pending_agent',
        updated_at = now()
  where id = p_conv_id
    and assigned_agent_id = auth.uid();
end;
$$ language plpgsql security definer;

-- RPC: mark conversation read for the calling user
create or replace function public.mark_conversation_read(p_conv_id uuid)
returns void as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();

  update public.support_conversations
    set opener_last_read_at = case when opener_id = auth.uid() then now() else opener_last_read_at end,
        counterparty_last_read_at = case when counterparty_id = auth.uid() then now() else counterparty_last_read_at end,
        agent_last_read_at = case when v_role = 'agent' then now() else agent_last_read_at end
  where id = p_conv_id;
end;
$$ language plpgsql security definer;

-- Storage bucket + RLS documented separately (run via Supabase dashboard SQL editor):
-- create bucket support-attachments (private, 5242880 byte limit)
-- See supabase/storage_support.sql for the RLS policies.
