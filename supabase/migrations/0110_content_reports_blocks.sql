-- 0110_content_reports_blocks.sql
--
-- UGC moderation (store requirement): users can REPORT a chat message and BLOCK
-- a counterpart. Reports are surfaced to agents in the support-app (dedicated
-- reports view, NOT funneled into support_tickets — support_tickets.order_id is
-- NOT NULL + UNIQUE, which can't represent support-chat or repeat reports;
-- decision recorded in DECISIONS.md).
--
-- Creates:
--   • content_reports  — one row per reported message (agents triage open→reviewed→actioned)
--   • content_blocks   — per-user block list (client hides blocked senders + disables composing)
-- Adds content_reports to the realtime publication (live agent badge count).

-- ── content_reports ───────────────────────────────────────────────────────────
create table if not exists public.content_reports (
  id               uuid        primary key default gen_random_uuid(),
  reporter_id      uuid        not null references public.profiles(id) on delete cascade,
  reported_user_id uuid        not null references public.profiles(id) on delete cascade,
  context          text        not null check (context in ('order_chat','support_chat')),
  order_id         uuid        references public.orders(id) on delete set null,
  message_id       uuid,        -- references order_messages OR support_messages by context (no FK)
  reason           text,
  status           text        not null default 'open' check (status in ('open','reviewed','actioned')),
  created_at       timestamptz not null default now()
);

create index if not exists content_reports_status_created_idx
  on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;

-- Reporter inserts/reads only their own reports.
drop policy if exists "Reporters insert own reports" on public.content_reports;
create policy "Reporters insert own reports"
  on public.content_reports for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "Reporters read own reports" on public.content_reports;
create policy "Reporters read own reports"
  on public.content_reports for select to authenticated
  using (reporter_id = auth.uid());

-- Agents read + action all reports. is_agent() queries profiles (not
-- content_reports) so there is no recursive-policy cycle.
drop policy if exists "Agents read all reports" on public.content_reports;
create policy "Agents read all reports"
  on public.content_reports for select to authenticated
  using (public.is_agent());

drop policy if exists "Agents update reports" on public.content_reports;
create policy "Agents update reports"
  on public.content_reports for update to authenticated
  using (public.is_agent())
  with check (public.is_agent());

grant select, insert, update on public.content_reports to authenticated;

-- ── content_blocks ────────────────────────────────────────────────────────────
create table if not exists public.content_blocks (
  blocker_id uuid        not null references public.profiles(id) on delete cascade,
  blocked_id uuid        not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.content_blocks enable row level security;

-- A user manages only their own block list.
drop policy if exists "Users read own blocks" on public.content_blocks;
create policy "Users read own blocks"
  on public.content_blocks for select to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "Users insert own blocks" on public.content_blocks;
create policy "Users insert own blocks"
  on public.content_blocks for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "Users delete own blocks" on public.content_blocks;
create policy "Users delete own blocks"
  on public.content_blocks for delete to authenticated
  using (blocker_id = auth.uid());

grant select, insert, delete on public.content_blocks to authenticated;

-- ── Realtime (live agent badge for open reports) ──────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='content_reports'
  ) then
    alter publication supabase_realtime add table public.content_reports;
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
