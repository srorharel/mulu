-- Order-scoped washer↔consumer direct messaging
-- chat is writable while the order is active (accepted/en_route/arrived/in_progress)
-- becomes read-only (no new inserts) once status moves to pending_approval or later

create table public.order_messages (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index order_messages_order_id_created_at_idx
  on public.order_messages(order_id, created_at);

alter table public.order_messages enable row level security;

-- Both parties on the order (and support staff) can read all messages for that order.
-- No status restriction on reads — history is preserved after completion.
create policy "Order participants can read messages"
on public.order_messages for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_messages.order_id
      and (o.consumer_id = auth.uid() or o.washer_id = auth.uid())
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'support')
  )
);

-- Both parties can send, but only while the order is in an active status.
-- pending / pending_approval / completed / cancelled are blocked.
create policy "Order participants can send messages while active"
on public.order_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_messages.order_id
      and (o.consumer_id = auth.uid() or o.washer_id = auth.uid())
      and o.status in ('accepted', 'en_route', 'arrived', 'in_progress')
  )
);

-- Only the recipient can mark messages as read (set read_at).
create policy "Recipients can mark messages read"
on public.order_messages for update to authenticated
using (
  sender_id <> auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_messages.order_id
      and (o.consumer_id = auth.uid() or o.washer_id = auth.uid())
  )
)
with check (sender_id <> auth.uid());

-- Enable realtime for live message delivery
alter publication supabase_realtime add table public.order_messages;
