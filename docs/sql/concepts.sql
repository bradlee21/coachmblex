create extension if not exists pgcrypto;

create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  label text not null,
  created_at timestamptz not null default now(),
  unique (domain, label)
);

alter table public.concepts enable row level security;

drop policy if exists "Authenticated users can read concepts" on public.concepts;
create policy "Authenticated users can read concepts"
  on public.concepts
  for select
  using (auth.role() = 'authenticated');
