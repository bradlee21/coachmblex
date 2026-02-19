# Vercel Setup (Phase 0)

## 1) Import into Vercel

1. Open Vercel and click **Add New > Project**.
2. Import GitHub repo `coach-mblex`.
3. Keep framework preset as **Next.js**.

## 2) Configure environment variables

Set these in both **Production** and **Preview** environments:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (optional, recommended)

## 3) Deploy and verify

1. Trigger deploy from Vercel.
2. Confirm build succeeds.
3. Open deployed URL and confirm homepage loads.
4. Run a new preview deployment from a small commit to verify Preview envs are wired.

## 4) Supabase Auth redirect checklist

In Supabase Auth settings, verify:

- Local redirect URL includes `http://localhost:3000`.
- Production redirect URL includes your Vercel domain, e.g. `https://<project>.vercel.app`.
- If you use a custom domain, add it too.
- Site URL matches your primary deployed URL.