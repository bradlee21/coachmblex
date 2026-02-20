create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  role text not null default 'user' check (role in ('user', 'questions_editor', 'admin')),
  coach_mode text not null default 'gentle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration snippet for existing environments:
alter table public.profiles
  add column if not exists role text not null default 'user';
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'questions_editor', 'admin'));

alter table public.profiles enable row level security;

create policy "Users can select own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profile_updated_at on public.profiles;

create trigger set_profile_updated_at
before update on public.profiles
for each row
execute function public.set_profile_updated_at();
