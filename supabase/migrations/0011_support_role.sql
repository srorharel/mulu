-- Extend role check to include 'agent'
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('consumer', 'washer', 'agent'));

-- Agent-specific fields (nullable for non-agents)
alter table public.profiles
  add column if not exists agent_display_name text,
  add column if not exists agent_is_active boolean default false;

-- Index for the agent queue: only active agents are queryable
create index if not exists idx_profiles_active_agents
  on public.profiles (role, agent_is_active) where role = 'agent';
