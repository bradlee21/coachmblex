# Slices

Active slicing plan and status tracker for Brains / Hands / Tester collaboration.

## Status Legend

- `planned`
- `in_progress`
- `blocked`
- `done`

## Active / Recent Slices

### DOC-WORKFLOW-1

- Status: `done`
- Title: Add workflow contract (`AGENTS.md`) + changelog/slicing docs
- Goal: Establish a documented collaboration contract and required documentation workflow without touching application code.
- In scope:
- Add repo-root `AGENTS.md` (Brains/Hands/Tester workflow contract)
- Ensure `docs/CHANGELOG.md` exists and append a changelog entry (append-only)
- Ensure `docs/slices.md` exists and track this slice
- Out of scope:
- Any application code changes
- Refactors or dependency changes
- Acceptance criteria:
- `AGENTS.md` exists with workflow contract rules (small slices, minimal diffs, explicit acceptance criteria, required tests, docs updates)
- `docs/CHANGELOG.md` exists
- `docs/slices.md` exists
- No application code files modified
- Required validation/tests:
- `git diff --name-only` (confirm only markdown docs touched by this slice)
- `git status --short` (note any pre-existing unrelated changes)
- Files expected to change:
- `AGENTS.md`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Initial workflow baseline created for future slices.

## Next Slice Template

Copy this block for new work:

### SLICE-ID

- Status: `planned`
- Title:
- Goal:
- In scope:
- Out of scope:
- Acceptance criteria:
- Required validation/tests:
- Files expected to change:
- Notes:
