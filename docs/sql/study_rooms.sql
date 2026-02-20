create extension if not exists pgcrypto;

create table if not exists public.study_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_user_id uuid not null references auth.users(id),
  status text not null default 'lobby' check (status in ('lobby', 'running', 'finished')),
  game_type_mode text not null default 'pick' check (game_type_mode in ('pick', 'roulette')),
  win_wedges int not null default 3,
  duration_sec int not null default 12,
  question_count int not null default 1,
  created_at timestamptz not null default now()
);

-- Migration snippet for existing environments:
alter table public.study_rooms
  add column if not exists game_type_mode text not null default 'pick';
alter table public.study_rooms
  add column if not exists win_wedges int not null default 3;
alter table public.study_rooms
  add column if not exists duration_sec int not null default 12;
alter table public.study_rooms
  add column if not exists question_count int not null default 1;

create index if not exists study_rooms_code_idx
  on public.study_rooms(code);

alter table public.study_rooms enable row level security;

drop policy if exists "Authenticated users can read study rooms" on public.study_rooms;
create policy "Authenticated users can read study rooms"
  on public.study_rooms
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "Users can create hosted study rooms" on public.study_rooms;
create policy "Users can create hosted study rooms"
  on public.study_rooms
  for insert
  with check (auth.uid() = host_user_id);

drop policy if exists "Hosts can update own study rooms" on public.study_rooms;
create policy "Hosts can update own study rooms"
  on public.study_rooms
  for update
  using (auth.uid() = host_user_id)
  with check (auth.uid() = host_user_id);
