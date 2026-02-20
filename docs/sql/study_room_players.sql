create extension if not exists pgcrypto;

create table if not exists public.study_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  score int not null default 0,
  wedges jsonb not null default '[]'::jsonb,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(room_id, user_id),
  check (jsonb_typeof(wedges) = 'array')
);

create index if not exists study_room_players_room_joined_idx
  on public.study_room_players(room_id, joined_at asc);

alter table public.study_room_players enable row level security;

drop policy if exists "Authenticated users can read room players" on public.study_room_players;
create policy "Authenticated users can read room players"
  on public.study_room_players
  for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.study_rooms sr
      where sr.id = study_room_players.room_id
    )
  );

drop policy if exists "Players can join room as self" on public.study_room_players;
create policy "Players can join room as self"
  on public.study_room_players
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.study_rooms sr
      where sr.id = study_room_players.room_id
    )
  );

drop policy if exists "Players can update own room row" on public.study_room_players;
create policy "Players can update own room row"
  on public.study_room_players
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Hosts can update player rows in own room" on public.study_room_players;
create policy "Hosts can update player rows in own room"
  on public.study_room_players
  for update
  using (
    exists (
      select 1 from public.study_rooms sr
      where sr.id = study_room_players.room_id
        and sr.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.study_rooms sr
      where sr.id = study_room_players.room_id
        and sr.host_user_id = auth.uid()
    )
  );

revoke update on public.study_room_players from authenticated;
grant update(score, wedges, last_seen_at) on public.study_room_players to authenticated;
