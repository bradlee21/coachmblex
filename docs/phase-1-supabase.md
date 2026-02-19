# Phase 1: Supabase Auth + Profiles

## Environment variables

Set these in local `.env.local` and in Vercel project settings:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=...
```

- For local dev, set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
- For production, set `NEXT_PUBLIC_SITE_URL=https://<your-vercel-domain>`

## SQL setup

Run the SQL in `docs/sql/profiles.sql` in the Supabase SQL Editor:

1. Open Supabase project dashboard.
2. Go to `SQL Editor`.
3. Paste contents of `docs/sql/profiles.sql`.
4. Run query.

This creates `public.profiles`, enables RLS, and adds policies so users can select/insert/update only their own row.

## Auth URL configuration

In Supabase dashboard (`Authentication` -> `URL Configuration`):

- Site URL:
  - `http://localhost:3000` for local development
  - your Vercel URL for production
- Redirect URLs:
  - `http://localhost:3000/auth/update-password`
  - `https://<your-vercel-domain>/auth/update-password`

The reset-password flow uses `redirectTo: ${siteUrl}/auth/update-password`.
