# Seeding Questions

## 1) Run SQL in Supabase SQL Editor

Run these files in order:

1. `docs/sql/concepts.sql`
2. `docs/sql/questions.sql`
3. `docs/sql/attempts.sql`

## 2) Set local env vars (do not commit)

In PowerShell:

```powershell
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

- Use the service role key only for local seeding.
- Do not place service role keys in repo files.

## 3) Run seed script

```powershell
npm run seed
```

Seed source:

- `src/content/questions.seed.json` (about 30 starter questions)

The script upserts concepts and inserts questions.
