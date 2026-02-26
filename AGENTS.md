# AGENTS.md

## Purpose
This repo is built using a strict slice workflow with ChatGPT + Codex CLI + Brad. The goal is fast iteration without regressions: minimal diffs, clear acceptance criteria, deterministic validation, and explicit “Brad actions” for DB/migrations.

---

## Roles (Brains / Hands / Tester)

### Brains (ChatGPT)
- Plans slices and acceptance criteria.
- Produces Codex-ready assignments (scoped, minimal).
- Reviews outcomes and proposes next slices.

### Hands (Codex CLI)
- Implements the smallest safe change to satisfy the current slice.
- Avoids scope creep, refactors, or style churn.
- Runs required validations **sequentially** and reports exact results.

### Tester (Brad)
- Provides intent and constraints.
- Runs human verification on UI/behavior.
- Runs DB SQL/migrations when explicitly instructed (hands-off otherwise).

---

## Codex Multi-Agent Mode (Main + Sedum + Aster)

Codex CLI has three threads:

### Main (Coordinator / Integrator)
- Owns integration, conflict resolution, and merge order.
- Assigns work to Sedum/Aster with strict file boundaries.
- Runs sequential validation and produces the final slice report.
- Default owner of `docs/slices.md` and `docs/CHANGELOG.md` updates.

### Sedum (DB / SQL / Migrations Specialist)
- Owns: schema changes, backfills, constraints/indexes, DB reports, SQL scripts.
- Allowed changes: `docs/sql/**`, migration files, DB-related docs/templates.
- Not allowed (unless explicitly assigned): UI/runtime changes in `app/**`.

### Aster (Repo Sweep / Inventory Specialist)
- Owns: repo-wide search, checklists, risk inventories, migration maps.
- Default mode: planning-only (no edits).
- If edits are requested: docs-only unless Main expands scope.

### Multi-agent operating rules
- One agent = one scoped assignment.
- Agents must avoid overlapping hot files unless Main explicitly approves.
- **Never run build/test in parallel across agents** (avoid `.next` race conditions).
- Merge order for schema work:
  1) Sedum (DB add/backfill + report)
  2) Main (app/importer cutover)
  3) Sedum (drop legacy) only after stability

---

## Core Rules (Non-Negotiable)
- Ship in small slices.
- Prefer minimal diffs over broad refactors.
- Do not expand scope without explicit approval (new slice instead).
- Keep changes localized and readable.
- Documentation is part of done: update `docs/CHANGELOG.md` (append-only) and `docs/slices.md`.

---

## Slice-First Process (Required)

### 1) Define the slice (docs/slices.md)
Each slice entry must include:
- ID + Title
- Status: `planned | in_progress | blocked | done`
- Goal
- In scope / Out of scope
- Acceptance criteria (testable)
- Required validation/tests
- Files expected to change (best effort)

### 2) Brains prepares the handoff
- Restate the smallest viable implementation.
- Call out risks/dependencies/assumptions.
- Provide agent assignment(s) with file boundaries.

### 3) Hands implements
- Change only files needed for the slice.
- Avoid opportunistic refactors/renames/reformatting.
- If unexpected issues appear: stop and propose a new slice.

### 4) Hands validates and reports (sequential)
- Run required validations **sequentially** (never concurrently).
- Report pass/fail clearly with command names and exit codes.
- If a command cannot run, say why and what remains unverified.

### 5) Close the slice
- Update `docs/slices.md` status.
- Append a concise entry to `docs/CHANGELOG.md` (append-only).

---

## Validation / Testing Contract
- Every slice must specify at least one validation method:
  - `npm run smoke`
  - `npm run build`
  - or explicit manual verification steps (when automation isn’t available)
- Hands must report exactly what ran and results.
- Tester performs final human acceptance for UI/behavior.

**Important:** Avoid `.next` races.
- Do not run smoke/build concurrently.
- If needed, run sequentially and rerun build after smoke.

---

## Database / Migrations / Queries Contract (Hands-off Requirement)

Brad is intentionally hands-off on DB work unless explicitly instructed.

### Required reporting (every slice)
At the end of every slice report, Hands must include one of these blocks:

**A)**
- `Brad Action Required: none`

**OR B) Brad Action Required**
- **What to run:** exact SQL file paths / migration names / CLI commands
- **Where to run it:** Supabase SQL editor, migration runner, etc.
- **When to run it:** before tests, before deploy, after merge, etc.
- **Expected outcome:** schema/data changes, counts/outputs expected
- **Failure signals:** common errors + what output/logs to paste back

### Execution rules
- Hands must not assume DB steps were run unless Brad confirms.
- If a slice depends on DB changes being applied, mark it **blocked** until completed.
- DB-related slices must mention DB actions in acceptance criteria and validations.
- Hands must never claim a DB-related slice is done without the action block.

---

## Output Format (Hands final report)
Hands should end every slice with a structured report:

- Summary of changes
- Files changed
- Commands run (sequential) + results
- Manual verification required (if any)
- Brad Action Required: none / (full block)
- Follow-ups / next slice suggestions (optional)

---

## Diff Discipline
- Smallest implementation that satisfies the slice.
- No unrelated cleanup.
- No dependency additions unless explicitly required.
- No hidden behavior changes outside acceptance criteria.
- If a refactor is needed, split it into a separate slice first.