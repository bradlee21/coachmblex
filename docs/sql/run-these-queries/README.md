# Run These Queries

Use this folder for copy/paste-ready SQL scripts that should be run in the Supabase SQL Editor.

Guidelines:
- Add one file per change set using a date prefix, e.g. `YYYY-MM-DD-<topic>.sql`.
- Keep scripts idempotent (`if exists` / `if not exists`) when possible.
- Put statements in the required execution order.
- If a change depends on another, mention it at the top of the file.
