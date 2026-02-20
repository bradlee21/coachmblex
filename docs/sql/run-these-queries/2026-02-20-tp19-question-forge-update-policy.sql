begin;

alter table public.questions enable row level security;

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

commit;
