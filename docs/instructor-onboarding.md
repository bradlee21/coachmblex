# Instructor Onboarding (Question Forge)

Use this checklist when granting `questions_editor` access.

## 1) Create the instructor user
1. In Supabase dashboard, open **Authentication > Users**.
2. Create or invite the instructor user.
3. Confirm the user can sign in to the app.

## 2) Set profile role to `questions_editor`
Run this in Supabase SQL Editor (replace the email):

```sql
-- Find the auth user id
select id, email
from auth.users
where email = 'instructor@example.com';

-- Ensure a profile row exists
insert into public.profiles (id, role)
values ('PUT_USER_UUID_HERE', 'questions_editor')
on conflict (id) do update
set role = excluded.role;

-- Verify role
select id, role
from public.profiles
where id = 'PUT_USER_UUID_HERE';
```

## 3) Required SQL / policy checklist
- Profiles role column exists and allows: `user | questions_editor | admin`.
- `public.questions` RLS is enabled.
- `public.questions` insert policy allows `questions_editor` and `admin`.
- `public.questions` update policy allows `questions_editor` and `admin`.

Reference SQL docs:
- `docs/sql/profiles.sql`
- `docs/sql/questions.sql`
- `docs/sql/run-these-queries/2026-02-20-tp17a-tp17b-roles-and-forge.sql`
- `docs/sql/run-these-queries/2026-02-20-tp19-question-forge-update-policy.sql`

## 4) Verification steps
1. User can access `/admin/questions`.
2. User cannot access other `/admin/*` pages.
3. User can create and edit a question:
   - Save a new question.
   - Find it via Search.
   - Edit and save update.

## 5) Troubleshooting
- Role missing:
  - `profiles.role` is not `questions_editor` or no profile row exists.
- Policy missing:
  - Insert works for admin only, fails for editor.
  - Update fails with RLS/policy error.
- RLS errors (`401/403` or `42501`):
  - Confirm policies in `docs/sql/questions.sql` are applied in the target Supabase project.
- Can sign in but cannot see Question Forge:
  - Verify the app user session matches the same user id updated in `public.profiles`.
