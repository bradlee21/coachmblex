# Content Packs

Use JSON packs to bulk import questions into `public.questions`.

## Command

```bash
npm run import:pack -- src/content/packs/<pack-file>.json
```

Required env vars for import:
- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (or `SERVICE_ROLE_KEY`)

## Pack Shape

```json
{
  "pack_id": "example-pack-001",
  "source": "internal-beta",
  "meta": {
    "visibility": "active"
  },
  "questions": [
    {
      "domain_code": "D2",
      "question_type": "mcq",
      "prompt": "Which muscle primarily abducts the hip?",
      "choices": {
        "A": "Gluteus medius",
        "B": "Adductor longus",
        "C": "Biceps femoris",
        "D": "Rectus femoris"
      },
      "correct_choice": "A",
      "answer": "Gluteus medius",
      "why": "It is a prime hip abductor.",
      "trap": "Adductor longus does the opposite action.",
      "hook": "Abduct = glute med.",
      "difficulty": "easy"
    }
  ]
}
```

## Fields

Top-level:
- `pack_id` string (preferred) or `packId` string or `meta.id` string
- `source` string
- `meta.visibility` string (optional): `active` | `legacy` | `draft`
- `questions` array

Per-question required:
- `domain_code` string: `D1` | `D2` | `D3` | `D4` | `D5` | `D6` | `D7`
- `question_type` string: `mcq` | `reverse` | `fill`
- `prompt` string

Per-question required for `mcq`/`reverse`:
- `choices` object with keys `A`, `B`, `C`, `D`
- `correct_choice` string: `A` | `B` | `C` | `D`

Per-question required for `fill`:
- `correct_text` string

Per-question optional:
- `answer`, `why`, `trap`, `hook` strings
- `difficulty` string (defaults to `medium`)
- `blueprint_code` string (legacy fallback only; importer maps `1..7` roots to `D1..D7` when `domain_code` is missing)
- `domain`, `subtopic` strings (if omitted, importer derives domain text from `domain_code` and uses `subtopic='import'`)
- extra fields like `tags`/`meta` are ignored by importer

## Test Center Visibility

- `/test` only shows packs with `meta.visibility: "active"`.
- Packs with `meta.visibility: "legacy"` or `meta.visibility: "draft"` are hidden.
- Packs with missing or invalid `meta.visibility` are treated as `legacy` (hidden by default).

## MBLEx 100-Question Standard

Use this standard for new production MBLEx packs:

- Versioning baseline:
- Legacy `-v1` MBLEx packs are removed from the repo.
- Author/import only `-v2` MBLEx packs going forward.
- v2 packs are expected to be prompt-locked with aligned distractors.
- Total questions: `100`
- Difficulty mix:
- `40` `easy`
- `40` `medium`
- `20` `hard`
- `domain_code` is required on every question (`D1..D7`)
- Top-level `meta.visibility` should be `"active"` for packs intended to appear in Test Center

Recommended top-level metadata for MBLEx packs:
- `pack_id`
- `source`
- `title`
- `meta` (for example: `visibility`, authoring metadata, version notes)

## Validation and Insert Behavior

- Importer validates each row before insert.
- Invalid rows are skipped and reported with row numbers + reasons.
- Valid rows insert in batches of 50.
- On batch failure, importer retries row-by-row for that batch to isolate failures.
- Importer tolerates extra top-level metadata (`meta`, `title`, `notes`, etc.) and extra per-question metadata fields; these fields do not require DB schema changes.

## Output

Importer prints:
- pack id/source
- total rows
- inserted count
- skipped/invalid count
- per-row skip reasons
