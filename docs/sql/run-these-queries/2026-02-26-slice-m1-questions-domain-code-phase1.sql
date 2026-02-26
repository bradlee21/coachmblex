-- SLICE-M1 (Phase 1): add questions.domain_code, backfill from blueprint_code, keep blueprint_code for safety.

alter table public.questions
  add column if not exists domain_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_domain_code_check'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_domain_code_check
      check (
        domain_code is null
        or domain_code in ('D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7')
      );
  end if;
end
$$;

update public.questions
set domain_code = case split_part(trim(coalesce(blueprint_code, '')), '.', 1)
  when '1' then 'D1'
  when '2' then 'D2'
  when '3' then 'D3'
  when '4' then 'D4'
  when '5' then 'D5'
  when '6' then 'D6'
  when '7' then 'D7'
  else null
end
where domain_code is distinct from case split_part(trim(coalesce(blueprint_code, '')), '.', 1)
  when '1' then 'D1'
  when '2' then 'D2'
  when '3' then 'D3'
  when '4' then 'D4'
  when '5' then 'D5'
  when '6' then 'D6'
  when '7' then 'D7'
  else null
end;

create index if not exists questions_domain_code_idx
  on public.questions(domain_code);
