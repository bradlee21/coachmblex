-- SLICE-M2: ensure questions.domain_code exists/backfilled/indexed and report unmapped blueprint_code values.
-- Safe to run after SLICE-M1; statements are idempotent where possible.

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
set domain_code = case
  when upper(split_part(trim(coalesce(blueprint_code, '')), '.', 1)) in ('D1','D2','D3','D4','D5','D6','D7')
    then upper(split_part(trim(coalesce(blueprint_code, '')), '.', 1))
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '1' then 'D1'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '2' then 'D2'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '3' then 'D3'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '4' then 'D4'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '5' then 'D5'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '6' then 'D6'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '7' then 'D7'
  else null
end
where domain_code is distinct from case
  when upper(split_part(trim(coalesce(blueprint_code, '')), '.', 1)) in ('D1','D2','D3','D4','D5','D6','D7')
    then upper(split_part(trim(coalesce(blueprint_code, '')), '.', 1))
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '1' then 'D1'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '2' then 'D2'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '3' then 'D3'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '4' then 'D4'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '5' then 'D5'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '6' then 'D6'
  when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '7' then 'D7'
  else null
end;

create index if not exists questions_domain_code_idx
  on public.questions(domain_code);

-- Report unmapped nonblank blueprint_code values (review these before enforcing NOT NULL or write-path migration).
select
  trim(blueprint_code) as blueprint_code,
  count(*) as row_count,
  min(id) as example_question_id
from public.questions
where nullif(trim(coalesce(blueprint_code, '')), '') is not null
  and (
    case
      when upper(split_part(trim(coalesce(blueprint_code, '')), '.', 1)) in ('D1','D2','D3','D4','D5','D6','D7')
        then upper(split_part(trim(coalesce(blueprint_code, '')), '.', 1))
      when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '1' then 'D1'
      when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '2' then 'D2'
      when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '3' then 'D3'
      when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '4' then 'D4'
      when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '5' then 'D5'
      when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '6' then 'D6'
      when split_part(trim(coalesce(blueprint_code, '')), '.', 1) = '7' then 'D7'
      else null
    end
  ) is null
group by trim(blueprint_code)
order by row_count desc, blueprint_code asc;

