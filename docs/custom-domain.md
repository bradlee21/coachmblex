# Custom Domain Setup (Vercel + Namecheap + Supabase)

Use this runbook when mapping a new domain (example: `coachmblex.com`) to the Vercel deployment and keeping Supabase Auth redirects working.

## Vercel

1. Open the project in Vercel.
2. Go to `Settings` -> `Domains`.
3. Add both domains:
   - Apex: `coachmblex.com`
   - `www`: `www.coachmblex.com`
4. Set the preferred/primary domain (usually apex `coachmblex.com`).
5. Confirm Vercel shows the required DNS records and verification status.
6. Wait until both domains show as valid/configured in Vercel.

## Namecheap (Advanced DNS)

Add/update these host records in Namecheap `Domain List` -> `Manage` -> `Advanced DNS`.

Required records:

- `A` record
  - Host: `@`
  - Value: `216.198.79.1`
- `CNAME` record
  - Host: `www`
  - Value: `d61ab792c25c60b9.vercel-dns-017.com`

Notes:

- Remove or replace conflicting `@` and `www` records (old parking, forwarding, or host records).
- Do not keep duplicate `A`/`CNAME` records for the same host.
- If URL Redirect Records exist for `@` or `www`, remove them unless intentionally used.

## Supabase (Auth URL Configuration)

Open Supabase project -> `Authentication` -> `URL Configuration`.

Set:

- `Site URL`
  - `https://coachmblex.com`

- `Redirect URLs`
  - `https://coachmblex.com/**`
  - `https://www.coachmblex.com/**`

Notes:

- Keep both apex and `www` in the allowlist if either may appear during auth redirects.
- Supabase auth errors often come from a missing redirect URL pattern or wrong protocol (`http` vs `https`).

## Verification Checklist

1. `https://coachmblex.com` loads successfully (valid HTTPS certificate).
2. `https://www.coachmblex.com` resolves and redirects to the intended primary domain direction.
3. Vercel `Domains` page shows both domains as configured/valid.
4. Sign in flow completes and returns to the app (no auth redirect loop).
5. Browser console shows no `redirect_uri`/auth callback errors.
6. Network requests for auth callback return success (no 400 due to redirect mismatch).

## Troubleshooting

### DNS propagation delay

- DNS changes can take minutes to hours to propagate.
- Recheck after waiting and confirm the records are exactly correct.

### Wrong record type or duplicate records

- `@` should be an `A` record (not CNAME in this setup).
- `www` should be a `CNAME`.
- Remove old parking/forwarding records that conflict.

### Cloudflare proxy issues

- If using Cloudflare in front of the domain, disable proxying temporarily (`DNS only`) while validating setup.
- Proxy/caching can hide misconfiguration during initial setup.

### Supabase `redirect_uri` mismatch

- Verify Supabase `Site URL` and `Redirect URLs` exactly match deployed domain(s).
- Confirm callback URLs use `https`.
- Include both apex and `www` patterns if users can start auth from either.
