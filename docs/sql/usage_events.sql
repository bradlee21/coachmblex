create extension if not exists pgcrypto;

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(meta) = 'object')
);

create index if not exists usage_events_user_created_idx
  on public.usage_events(user_id, created_at desc);

create index if not exists usage_events_type_created_idx
  on public.usage_events(event_type, created_at desc);

-- Migration snippet for existing environments:
alter table public.usage_events
  add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.usage_events
  add column if not exists created_at timestamptz not null default now();
alter table public.usage_events
  drop constraint if exists usage_events_meta_check;
alter table public.usage_events
  add constraint usage_events_meta_check check (jsonb_typeof(meta) = 'object');
create index if not exists usage_events_user_created_idx
  on public.usage_events(user_id, created_at desc);
create index if not exists usage_events_type_created_idx
  on public.usage_events(event_type, created_at desc);

alter table public.usage_events enable row level security;

drop policy if exists "Users can insert own usage events" on public.usage_events;
create policy "Users can insert own usage events"
  on public.usage_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own usage events" on public.usage_events;
create policy "Users can read own usage events"
  on public.usage_events
  for select
  using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert on public.usage_events to authenticated;
