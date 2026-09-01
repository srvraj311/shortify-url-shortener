# Deployment

Target: Vercel project **`shortify`** (`sourabhs-projects-128319e4/shortify`,
`prj_cdb4OBdOBKkMr3kkYSANAENJCqk0`). The repo is already linked (`.vercel/`).

## 1. Environment variables

Already set via CLI (Production + Preview): `MONGODB_DB_NAME`, `PUBLIC_BASE_URL`.

**Still required** — add in the Vercel dashboard (Settings → Environment
Variables) or with `vercel env add <NAME> production`:

| Name | Value |
|---|---|
| `MONGODB_URI` | `mongodb+srv://<user>:<password>@enwrite.2m74x.mongodb.net/?retryWrites=true&w=majority&ssl=true` — **use a freshly rotated Atlas password** (see security note below) |
| `AUTH_SECRET` | a 32-byte hex string — `openssl rand -hex 32` |
| `CRON_SECRET` | a 32-byte hex string — `openssl rand -hex 32` |

Optional (recommended for full functionality):

| Name | Value | Effect |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | from [Upstash](https://console.upstash.com) free tier or Vercel Marketplace | enables shared cache + correct distributed rate limiting |
| `CORS_ALLOWED_ORIGINS` | comma-separated origins | if calling the API from another domain |

Delete the stale V0 var `DB_URL` — the new app doesn't read it.

## 2. Project settings

- **Framework preset:** Next.js (auto-detected; `vercel.json` also pins it).
- **Node.js version:** 20.x or 22.x (the old project was 18.x — bump it in
  Settings → General). `package.json` pins `"engines": { "node": "22.x" }`.
- **Root directory:** `.` (repo root).
- **Build/Install/Output:** leave as Next.js defaults.
- **Cron:** `/api/internal/cron` daily at 03:00 UTC is declared in `vercel.json`
  (Hobby allows one daily cron — see [ADR 0007](./docs/adr/0007-hobby-cron-limits.md)).

## 3. Deploy

```bash
git push -u origin feature/system-design-v1     # then open a PR -> merge to main
# or deploy the branch directly:
vercel deploy --prod
```

`main` → production, PRs → preview deployments.

## 4. Post-deploy

```bash
# create the indexes explicitly (production has autoIndex off)
MONGODB_URI='...' MONGODB_DB_NAME='url-shortener-v1' npm run db:indexes

# make yourself an admin
MONGODB_URI='...' ADMIN_EMAIL='you@example.com' ADMIN_PASSWORD='...' npm run seed:admin

# smoke test
BASE=https://shrtfy.vercel.app npx k6 run load-tests/smoke.js
```

Verify: `GET /health` → 200, `GET /ready` → 200, create + redirect works,
`/admin` loads for the admin user.

## Security note — rotate the V0 credential

`legacy/config.json` (committed to the public repo `srvraj311/shortify-url-shortener`)
contains a live Atlas connection string with username + password. **Before or
right after deploy:**

1. Atlas → Database Access → edit that user → **change password** (or delete the
   user and create a fresh one scoped to `url-shortener-v1`).
2. Update `MONGODB_URI` in Vercel with the new password.
3. Consider `git filter-repo` to purge `legacy/config.json` and
   `legacy/.env.v0` from history, then force-push. At minimum, the credential
   must no longer be valid.
