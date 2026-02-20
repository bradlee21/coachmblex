-- TP: Prevent duplicate questions at the database level.
-- Run this in order:
-- 1) dedupe existing rows
-- 2) add dedupe_key column
-- 3) enforce unique index on dedupe_key

-- 1) Remove existing duplicates, keep earliest created row per strict content signature.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by md5(
        lower(regexp_replace(trim(coalesce(question_type, '')), '\s+', ' ', 'g')) || '|' ||
        lower(regexp_replace(trim(coalesce(blueprint_code, '')), '\s+', ' ', 'g')) || '|' ||
        lower(regexp_replace(trim(coalesce(prompt, '')), '\s+', ' ', 'g')) || '|' ||
        lower(regexp_replace(trim(coalesce(choices->>0, '')), '\s+', ' ', 'g')) || '|' ||
        lower(regexp_replace(trim(coalesce(choices->>1, '')), '\s+', ' ', 'g')) || '|' ||
        lower(regexp_replace(trim(coalesce(choices->>2, '')), '\s+', ' ', 'g')) || '|' ||
        lower(regexp_replace(trim(coalesce(choices->>3, '')), '\s+', ' ', 'g')) || '|' ||
        coalesce(correct_index::text, '') || '|' ||
        lower(regexp_replace(trim(coalesce(explanation->>'answer', '')), '\s+', ' ', 'g')) || '|' ||
        lower(regexp_replace(trim(coalesce(explanation->>'why', '')), '\s+', ' ', 'g')) || '|' ||
        lower(regexp_replace(trim(coalesce(explanation->>'trap', '')), '\s+', ' ', 'g')) || '|' ||
        lower(regexp_replace(trim(coalesce(explanation->>'hook', '')), '\s+', ' ', 'g'))
      )
      order by created_at asc, id asc
    ) as rn
  from public.questions
)
delete from public.questions q
using ranked r
where q.ctid = r.ctid
  and r.rn > 1;

-- 2) Add generated dedupe key (safe to rerun).
alter table public.questions
  add column if not exists dedupe_key text
  generated always as (
    md5(
      lower(regexp_replace(trim(coalesce(question_type, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(blueprint_code, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(prompt, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>0, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>1, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>2, '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(choices->>3, '')), '\s+', ' ', 'g')) || '|' ||
      coalesce(correct_index::text, '') || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'answer', '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'why', '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'trap', '')), '\s+', ' ', 'g')) || '|' ||
      lower(regexp_replace(trim(coalesce(explanation->>'hook', '')), '\s+', ' ', 'g'))
    )
  ) stored;

-- 3) Enforce uniqueness going forward.
create unique index if not exists questions_dedupe_key_unique_idx
  on public.questions(dedupe_key);
