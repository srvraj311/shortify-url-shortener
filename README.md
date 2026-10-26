# Shortify — URL Shortener (system-design reference)

A production-oriented URL shortener that starts from a plain Frontend → Backend →
MongoDB CRUD app and evolves it — component by component, each justified by a
concrete requirement — into a system that demonstrates caching, rate limiting,
async analytics, the outbox pattern, idempotency, optimistic concurrency, fault
tolerance, observability, and horizontal-scale thinking.

Built to the plan in [`docs/`](./docs). The original app is preserved unchanged
under [`legacy/`](./legacy) as "V0".

## Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | **Next.js 15** (App Router, TS) on **Vercel** | plan is Vercel-centric; no JVM on Vercel ([ADR 0001](./docs/adr/0001-nextjs-over-spring-boot.md)) |
| Database | **MongoDB Atlas** | existing; flexible docs; TTL indexes |
| Cache + rate limit | **Upstash Redis** (optional) | shared state across serverless instances; degrades to Mongo-only ([ADR 0006](./docs/adr/0006-redis-optional.md)) |
| Queue | **Transactional outbox** in Mongo + drain | at-least-once without extra infra ([ADR 0005](./docs/adr/0005-transactional-outbox.md)) |
| Auth | opaque **HttpOnly cookie sessions** + hashed API keys | instant revocation ([ADR 0004](./docs/adr/0004-opaque-cookie-sessions.md)) |

## Layout

```
src/
  app/                Next.js routes — UI pages + /api/v1/* handlers + /:shortCode redirect
  lib/                infrastructure: config, logger, errors, db, redis, cache,
                      ratelimit, resilience, lock, metrics, crypto, shortcode,
                      url-validation, failure-injection
  server/
    http/             route wrapper (request-id/logging/metrics/error contract), auth, cron
    services/         domain logic (auth, url, analytics, apikey, abuse, admin, events, idempotency)
    workers/          outbox drain, idempotent consumers, aggregation, sweeper
  middleware.ts       edge: request-id, CORS, CSP
scripts/              seed-admin, ensure-indexes
load-tests/           k6 scripts
docs/                 architecture, ADRs, api, database, security, operations, performance
legacy/               the original Express + Angular 13 app (V0)
```

## Run locally

```bash
cp .env.example .env.local     # fill MONGODB_URI + AUTH_SECRET at minimum
npm install
npm run dev                     # http://localhost:3000
```

Redis is optional — without `UPSTASH_REDIS_REST_*` the app runs in Mongo-only
mode (weaker rate limiting, no shared cache; everything else works).

```bash
# make yourself an admin
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='at-least-8' npm run seed:admin
# create indexes explicitly (CI/deploy do this)
npm run db:indexes
npm test                        # vitest unit tests
```

## Deploy (Vercel)

1. Import the repo into Vercel (framework auto-detected).
2. Set env vars from `.env.example` (Production + Preview).
3. Push to `main` → production; PRs → preview deployments.
4. The daily cron (`/api/internal/cron`) is declared in `vercel.json`.

See [docs/operations/runbook.md](./docs/operations/runbook.md) and
[DEPLOYMENT.md](./DEPLOYMENT.md).

## The story the code tells (Plan §85)

CRUD → needs auth → needs authz → needs validation → needs rate limiting → needs
caching → needs analytics → analytics slows redirects → needs async processing →
workers fail → needs retries + DLQ → duplicate events → needs idempotent
consumers → traffic grows → needs horizontal scaling → cache becomes distributed
→ needs Redis → hot key appears → needs coalescing/CDN → DB becomes the
bottleneck → needs indexing/read models → eventually replicas/sharding.

Three paths matter most: **redirect** (fast, cached, fault-tolerant),
**creation** (authenticated, validated, idempotent, race-safe), **analytics**
(events, queue, async workers, eventual consistency, DLQ).
