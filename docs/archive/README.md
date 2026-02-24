# Archive Runbook (Physiology Midterm Soft Reset)

## Snapshot Export
- Run `npm run export:questions`
- Output file: `docs/archive/questions-export-YYYY-MM-DD.json`
- This exports `public.questions` rows where `pack_id = 'physiology-mid-term'`

## Archive Existing Pack Rows (No Deletes)
Run in Supabase SQL Editor:

```sql
update public.questions
set pack_id = 'physiology-mid-term-legacy'
where pack_id = 'physiology-mid-term';
```

Archive pack id: `physiology-mid-term-legacy`

## Restore (Reverse SQL)
If you need to restore the archived rows back to the active pack id:

```sql
update public.questions
set pack_id = 'physiology-mid-term'
where pack_id = 'physiology-mid-term-legacy';
```

## Reimport Curated Midterm Pack(s)
After running the archive SQL, reimport curated packs into `physiology-mid-term`:

```bash
npm run import:pack -- src/content/packs/physiology-mid-term-replacements-v1.fixed.json
```

If additional curated midterm pack files are added later, import them after the base pack in the intended replacement order.
