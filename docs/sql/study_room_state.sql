create table if not exists public.study_room_state (
  room_id uuid primary key references public.study_rooms(id) on delete cascade,
  turn_index int not null default 0,
  phase text not null default 'pick' check (phase in ('pick', 'question', 'reveal', 'finished')),
  game_type text not null default 'mcq', -- mcq | reverse | fill
  category_key text,
  question_id uuid references public.questions(id) on delete set null,
  started_at timestamptz,
  duration_sec int not null default 12,
  round_no int not null default 1,
  updated_at timestamptz not null default now()
);

-- Migration snippet for existing environments:
alter table public.study_room_state
  add column if not exists game_type text not null default 'mcq';
alter table public.study_room_state
  drop constraint if exists study_room_state_game_type_check;

create or replace function public.set_study_room_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_study_room_state_updated_at on public.study_room_state;
create trigger set_study_room_state_updated_at
before update on public.study_room_state
for each row
execute function public.set_study_room_state_updated_at();

alter table public.study_room_state enable row level security;

drop policy if exists "Authenticated users can read room state" on public.study_room_state;
create policy "Authenticated users can read room state"
  on public.study_room_state
  for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.study_rooms sr
      where sr.id = study_room_state.room_id
    )
  );

drop policy if exists "Hosts can create room state" on public.study_room_state;
create policy "Hosts can create room state"
  on public.study_room_state
  for insert
  with check (
    exists (
      select 1 from public.study_rooms sr
      where sr.id = study_room_state.room_id
        and sr.host_user_id = auth.uid()
    )
  );

drop policy if exists "Hosts can update room state" on public.study_room_state;
create policy "Hosts can update room state"
  on public.study_room_state
  for update
  using (
    exists (
      select 1 from public.study_rooms sr
      where sr.id = study_room_state.room_id
        and sr.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.study_rooms sr
      where sr.id = study_room_state.room_id
        and sr.host_user_id = auth.uid()
    )
  );
