-- TP34 onboarding profile flag.
-- Run in Supabase SQL Editor.

alter table public.profiles
  add column if not exists onboarding_complete boolean not null default false;

-- Optional backfill so existing active learners do not see first-run onboarding:
update public.profiles p
set onboarding_complete = true
where coalesce(p.onboarding_complete, false) = false
  and exists (
    select 1
    from public.attempts a
    where a.user_id = p.id
  );
