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
create unique index if not exists questions_dedupe_key_unique_idx
  on public.questions (
    md5(
      lower(regexp_replace(trim(coalesce(question_type, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(blueprint_code, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(prompt, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>0, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>1, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>2, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>3, '')), '\s+', ' ', 'g')) || '|' ||
      coalesce(correct_index::text, '') || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'answer', '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'why', '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'trap', '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'hook', '')), '\s+', ' ', 'g'))
    )
  );

-- Migration snippet for existing installs:
alter table public.questions add column if not exists blueprint_code text;
create index if not exists questions_blueprint_code_idx
  on public.questions(blueprint_code);
alter table public.questions add column if not exists question_type text default 'mcq';
create unique index if not exists questions_dedupe_key_unique_idx
  on public.questions (
    md5(
      lower(regexp_replace(trim(coalesce(question_type, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(blueprint_code, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(prompt, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>0, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>1, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>2, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>3, '')), '\s+', ' ', 'g')) || '|' ||
      coalesce(correct_index::text, '') || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'answer', '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'why', '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'trap', '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'hook', '')), '\s+', ' ', 'g'))
    )
  );

alter table public.questions enable row level security;

drop policy if exists "Authenticated users can read questions" on public.questions;
create policy "Authenticated users can read questions"
  on public.questions
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "Editors can insert questions" on public.questions;
create policy "Editors can insert questions"
  on public.questions
  for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('questions_editor', 'admin')
    )
  );

drop policy if exists "Editors can update questions" on public.questions;
create policy "Editors can update questions"
  on public.questions
  for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('questions_editor', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('questions_editor', 'admin')
    )
  );
