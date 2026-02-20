-- Set one existing auth user to questions_editor by email.
-- Replace the email below before running.

begin;

with target_user as (
  select id
  from auth.users
  where lower(email) = lower('instructor@example.com')
  limit 1
)
insert into public.profiles (id, role)
select id, 'questions_editor'
from target_user
on conflict (id) do update
set role = excluded.role;

-- Verify result:
select p.id, u.email, p.role, p.updated_at
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('instructor@example.com')
limit 1;

commit;
