-- Add canonical pack_id to questions for Testing Center / custom drill pack filtering.
-- Run in Supabase SQL Editor before re-importing packs.

alter table if exists public.questions
  add column if not exists pack_id text;

create index if not exists questions_pack_id_idx
  on public.questions (pack_id);

-- Backfill from existing pack fields when present.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'questions'
      and column_name = 'source_pack'
  ) then
    execute $sql$
      update public.questions
      set pack_id = nullif(btrim(source_pack), '')
      where (pack_id is null or btrim(pack_id) = '')
        and source_pack is not null
        and btrim(source_pack) <> ''
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'questions'
      and column_name = 'source'
  ) then
    execute $sql$
      update public.questions
      set pack_id = nullif(btrim(source ->> 'pack_id'), '')
      where (pack_id is null or btrim(pack_id) = '')
        and jsonb_typeof(source) = 'object'
        and nullif(btrim(source ->> 'pack_id'), '') is not null
    $sql$;

    execute $sql$
      update public.questions
      set pack_id = nullif(btrim(source ->> 'packId'), '')
      where (pack_id is null or btrim(pack_id) = '')
        and jsonb_typeof(source) = 'object'
        and nullif(btrim(source ->> 'packId'), '') is not null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'questions'
      and column_name = 'metadata'
  ) then
    execute $sql$
      update public.questions
      set pack_id = nullif(btrim(metadata ->> 'pack_id'), '')
      where (pack_id is null or btrim(pack_id) = '')
        and jsonb_typeof(metadata) = 'object'
        and nullif(btrim(metadata ->> 'pack_id'), '') is not null
    $sql$;

    execute $sql$
      update public.questions
      set pack_id = nullif(btrim(metadata ->> 'packId'), '')
      where (pack_id is null or btrim(pack_id) = '')
        and jsonb_typeof(metadata) = 'object'
        and nullif(btrim(metadata ->> 'packId'), '') is not null
    $sql$;
  end if;
end $$;

-- Verification
select count(*) as total_questions from public.questions;
select count(*) as questions_with_pack_id
from public.questions
where nullif(btrim(pack_id), '') is not null;

select pack_id, count(*) as question_count
from public.questions
where nullif(btrim(pack_id), '') is not null
group by pack_id
order by question_count desc, pack_id asc
limit 25;

-- If many rows remain null, re-import packs after updating scripts/import-pack.mjs.
