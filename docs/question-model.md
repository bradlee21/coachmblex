# Canonical Question Model

Forward standard for new question packs and generated content.

Legacy pack/import shapes are still supported by `scripts/import-pack.mjs` for compatibility, but new content should use this canonical model.

## Goals

- One stable shape for MCQ and FIB questions
- Clear correctness rules (`correct.index` for MCQ, `correct.text` for FIB)
- Explanation fields in one place (`explanation.{why,trap,hook}`)
- Easy validation and template generation

## Canonical Model

Top-level question object:

- `id` (`string`, optional)
  - Optional in pack files; DB may generate IDs.
- `prompt` (`string`, required)
- `type` (`"mcq" | "fib"`, required)
- `choices` (`string[]`, required for `mcq`; omitted or empty for `fib`)
- `correct` (`object`, required)
  - `mcq` canonical: `{ "index": number }` (0-based)
  - `fib` canonical: `{ "text": string }`
- `explanation` (`object`, optional but recommended)
  - `{ answer?: string, why?: string, trap?: string, hook?: string }`
  - `answer` is optional (can be derived from `correct`)
- `tags` (`string[]`, optional)
- `blueprintCodes` (`string[]`, optional)
  - Use to map to one or more taxonomy/blueprint codes.
- `difficulty` (`number`, optional)
  - Integer `1` to `5`
- `sourcePack` (`string`, optional)
- `packId` (`string`, optional)

## Normalization Rules

- MCQ `correct.index` is **0-based everywhere**.
- FIB comparison normalization should match runtime logic:
  - trim
  - lowercase
  - collapse internal whitespace
  - ignore trailing punctuation (`.,!?;:`)
- Explanation fields for new content live only under `explanation`:
  - `explanation.why`
  - `explanation.trap`
  - `explanation.hook`
- Do not use new top-level `why`, `trap`, `hook` in new packs.

## MCQ Example

```json
{
  "prompt": "Which cranial nerve is responsible for smell?",
  "type": "mcq",
  "choices": [
    "Olfactory nerve (CN I)",
    "Optic nerve (CN II)",
    "Trigeminal nerve (CN V)",
    "Facial nerve (CN VII)"
  ],
  "correct": { "index": 0 },
  "explanation": {
    "answer": "Olfactory nerve (CN I)",
    "why": "CN I carries special sensory fibers for olfaction.",
    "trap": "CN II is vision, not smell.",
    "hook": "CN I = smell (one nose)."
  },
  "blueprintCodes": ["1.4.2"],
  "tags": ["cranial nerves", "neuro"],
  "difficulty": 2,
  "sourcePack": "neuro-basics",
  "packId": "neuro-001"
}
```

## FIB Example

```json
{
  "prompt": "The median nerve receives fibers from the lateral and _____ cords.",
  "type": "fib",
  "correct": { "text": "medial" },
  "explanation": {
    "why": "The median nerve is formed by roots from both lateral and medial cords.",
    "trap": "Posterior cord contributes to radial and axillary, not median formation.",
    "hook": "Median = middle blend (lateral + medial)."
  },
  "blueprintCodes": ["1.6.1"],
  "tags": ["brachial plexus"],
  "difficulty": 3,
  "sourcePack": "neuro-basics",
  "packId": "neuro-001"
}
```

## Mapping Notes (Canonical -> Runtime/DB)

- Runtime/DB currently supports legacy fields and variants (`correct_text`, `correct_answer`, `answer`, top-level `why/trap/hook`, `explanation_*`).
- Canonical pack content should still be transformed by importer scripts into the current DB row shape.
- Importer compatibility remains intentionally broad to avoid breaking older packs.

## Authoring Guidance

- Prefer `type: "mcq"` or `type: "fib"` only.
- For MCQ, make `choices[correct.index]` the exact intended answer string.
- Keep `explanation.why/trap/hook` concise and teaching-focused.
- Include `blueprintCodes` when known, even if only one code applies.
- Use `scripts/validate-pack.mjs` before importing.
- Use `scripts/new-question.mjs` to generate canonical templates quickly.
