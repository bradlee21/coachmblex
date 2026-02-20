-- TP33 Feedback table + RLS.
-- Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.feedback
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.feedback
  add column if not exists email text;
alter table public.feedback
  add column if not exists message text;
alter table public.feedback
  add column if not exists context jsonb not null default '{}'::jsonb;
alter table public.feedback
  add column if not exists created_at timestamptz not null default now();

create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);

create index if not exists feedback_user_id_idx
  on public.feedback (user_id);

alter table public.feedback enable row level security;

drop policy if exists "Users can insert own feedback" on public.feedback;
create policy "Users can insert own feedback"
  on public.feedback
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Admins can read feedback" on public.feedback;
create policy "Admins can read feedback"
  on public.feedback
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

grant insert on table public.feedback to authenticated;
grant select on table public.feedback to authenticated;

-- Verify:
-- select id, user_id, email, message, context, created_at
-- from public.feedback
-- order by created_at desc
-- limit 50;
