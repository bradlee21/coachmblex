# AGENTS.md

## Workflow Contract (Brains / Hands / Tester)

This repo is operated collaboratively by:

- `Brains` (ChatGPT): plans slices, clarifies acceptance criteria, reviews scope, keeps docs current.
- `Hands` (Codex): makes the smallest safe code/doc changes, runs required checks, reports exact results.
- `Tester` (User): provides intent, validates behavior, approves scope changes, performs final human verification.

## Core Rules

- Ship in small slices.
- Prefer minimal diffs over broad refactors.
- Do not expand scope without explicit approval.
- Every slice must have explicit acceptance criteria.
- Every slice must name required validation/tests before implementation starts.
- Documentation is part of done: update `docs/CHANGELOG.md` (append-only) and `docs/slices.md`.

## Slice-First Process (Required)

1. Define the slice in `docs/slices.md`
- Add/update a slice entry with:
- `ID`
- `Title`
- `Status` (`planned | in_progress | blocked | done`)
- `Goal`
- `In scope`
- `Out of scope`
- `Acceptance criteria`
- `Required validation/tests`
- `Files expected to change`

2. Brains prepares the handoff
- Restate the smallest viable implementation.
- Call out risks, dependencies, and any assumptions.
- Confirm test commands and expected outcomes.

3. Hands implements the slice
- Change only files needed for the slice.
- Keep diffs narrow and readable.
- Avoid opportunistic refactors, renames, or style churn.
- If unexpected issues appear, stop and propose a new slice instead of widening the current one.

4. Hands validates and reports
- Run the agreed validation/tests.
- Report pass/fail clearly with command names.
- If a command cannot be run, state why and what remains unverified.

5. Brains closes the slice docs
- Mark slice status in `docs/slices.md`.
- Append a concise entry to `docs/CHANGELOG.md` (never rewrite prior entries).
- Summarize changed files and any follow-up slices.

## Definition of Ready (Before Hands Starts)

- Problem statement is concrete.
- Acceptance criteria are testable.
- Required validation/tests are listed.
- Scope boundaries are explicit.
- Expected changed files are identified (best effort).

## Definition of Done

- Acceptance criteria met.
- Required validation/tests executed (or explicitly documented as blocked).
- Diff remains within approved scope.
- `docs/CHANGELOG.md` updated (append-only).
- `docs/slices.md` updated with current status and next-step notes.

## Diff Discipline

- Prefer the smallest implementation that satisfies the slice.
- No unrelated cleanup in the same slice.
- No dependency additions unless explicitly required by the slice.
- No hidden behavior changes outside acceptance criteria.
- If a larger refactor is needed, split it into a separate slice first.

## Validation / Testing Contract

- Every slice must specify at least one validation method:
- automated test command(s)
- build/lint/typecheck command(s)
- or explicit manual verification steps (when automation is not available)
- Hands must report exactly what was run and the result.
- Tester performs final human acceptance when behavior/UI is involved.

## Documentation Contract

- `docs/CHANGELOG.md` is append-only.
- `docs/slices.md` is the active source of truth for slice planning/status.
- For each completed slice, add:
- a changelog note (what changed)
- a slices status update (done / blocked / next)

## Communication Contract

- Brains: optimize for clarity, scope control, and acceptance criteria.
- Hands: optimize for execution speed, correctness, and minimal diffs.
- Tester: optimize for intent clarity and real-world verification.
- If any role is unsure, pause and resolve ambiguity before expanding changes.
