create type support_conv_status as enum ('open', 'pending_agent', 'assigned', 'resolved', 'closed');

create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  -- Who opened it
  opener_id uuid not null references public.profiles(id) on delete restrict,
  opener_role text not null check (opener_role in ('consumer', 'washer')),
  -- Optional order context
  order_id uuid null references public.orders(id) on delete set null,
  -- Optional second user (e.g. washer pulled into a consumer's thread about their order)
  counterparty_id uuid null references public.profiles(id) on delete set null,
  -- Agent handling
  assigned_agent_id uuid null references public.profiles(id) on delete set null,
  -- State
  status support_conv_status not null default 'pending_agent',
  subject text null,
  -- Read tracking (one timestamp per role)
  opener_last_read_at timestamptz null,
  counterparty_last_read_at timestamptz null,
  agent_last_read_at timestamptz null,
  -- Lifecycle
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  last_message_at timestamptz null
);

create index idx_support_conv_opener on public.support_conversations(opener_id, status);
create index idx_support_conv_counterparty on public.support_conversations(counterparty_id) where counterparty_id is not null;
create index idx_support_conv_agent on public.support_conversations(assigned_agent_id, status);
create index idx_support_conv_order on public.support_conversations(order_id) where order_id is not null;
create index idx_support_conv_queue on public.support_conversations(status, last_message_at desc) where status in ('pending_agent', 'assigned');
