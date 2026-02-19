create extension if not exists pgcrypto;

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  correct boolean not null,
  confidence text not null check (confidence in ('sure', 'kinda', 'guess')),
  created_at timestamptz not null default now()
);

create index if not exists attempts_user_id_created_at_idx
  on public.attempts(user_id, created_at desc);

alter table public.attempts enable row level security;

drop policy if exists "Users can read own attempts" on public.attempts;
create policy "Users can read own attempts"
  on public.attempts
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own attempts" on public.attempts;
create policy "Users can insert own attempts"
  on public.attempts
  for insert
  with check (auth.uid() = user_id);
