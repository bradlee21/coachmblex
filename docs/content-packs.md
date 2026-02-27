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

## Validation and Insert Behavior

- Importer validates each row before insert.
- Invalid rows are skipped and reported with row numbers + reasons.
- Valid rows insert in batches of 50.
- On batch failure, importer retries row-by-row for that batch to isolate failures.

## Output

Importer prints:
- pack id/source
- total rows
- inserted count
- skipped/invalid count
- per-row skip reasons
