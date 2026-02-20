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
  "packId": "example-pack-001",
  "source": "internal-beta",
  "questions": [
    {
      "blueprint_code": "2.D",
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
- `packId` string
- `source` string
- `questions` array

Per-question required:
- `blueprint_code` string
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
- `domain`, `subtopic` strings (if omitted, importer derives domain from `blueprint_code` and uses `subtopic='import'`)
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
