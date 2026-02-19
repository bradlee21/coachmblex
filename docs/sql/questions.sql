create extension if not exists pgcrypto;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  subtopic text not null,
  blueprint_code text,
  question_type text not null default 'mcq',
  concept_id uuid references public.concepts(id) on delete set null,
  prompt text not null,
  choices jsonb not null,
  correct_index integer not null check (correct_index between 0 and 3),
  explanation jsonb not null,
  difficulty text not null default 'medium',
  created_at timestamptz not null default now(),
  check (jsonb_typeof(choices) = 'array'),
  check (jsonb_array_length(choices) = 4)
);

create index if not exists questions_blueprint_code_idx
  on public.questions(blueprint_code);

-- Migration snippet for existing installs:
alter table public.questions add column if not exists blueprint_code text;
create index if not exists questions_blueprint_code_idx
  on public.questions(blueprint_code);
alter table public.questions add column if not exists question_type text default 'mcq';

alter table public.questions enable row level security;

drop policy if exists "Authenticated users can read questions" on public.questions;
create policy "Authenticated users can read questions"
  on public.questions
  for select
  using (auth.role() = 'authenticated');
