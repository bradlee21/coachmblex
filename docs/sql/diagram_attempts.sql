create extension if not exists pgcrypto;

create table if not exists public.diagram_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  region_key text not null,
  label_set_id text not null,
  blueprint_code text not null,
  score integer not null,
  total integer not null,
  created_at timestamptz not null default now()
);

create index if not exists diagram_attempts_user_id_created_at_idx
  on public.diagram_attempts(user_id, created_at desc);

alter table public.diagram_attempts enable row level security;

drop policy if exists "Users can read own diagram attempts" on public.diagram_attempts;
create policy "Users can read own diagram attempts"
  on public.diagram_attempts
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own diagram attempts" on public.diagram_attempts;
create policy "Users can insert own diagram attempts"
  on public.diagram_attempts
  for insert
  with check (auth.uid() = user_id);
