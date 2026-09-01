# Operations runbook

## Endpoints

| Path | Purpose |
|---|---|
| `GET /health` | liveness — process up. Never touches deps. |
| `GET /ready` | readiness — Mongo ping (critical), Redis status (informational). 503 if Mongo down. |
| `GET /metrics` | JSON metrics; `?format=prometheus` for scrape. Counters, latency p50/p95/p99, breaker states. |
| `POST /api/internal/cron` | daily job (drain + aggregate + sweep). Auth: `Authorization: Bearer $CRON_SECRET`. |
| `POST /api/internal/worker` | outbox drain only. Same auth. Call manually to force-drain. |
| `POST /api/internal/aggregate` | rebuild `url_daily_stats`. Same auth. |
| `POST /api/internal/sweep` | expire URLs, purge stale keys. Same auth. |

## Common tasks

**Force analytics to catch up**
```bash
curl -X POST https://<host>/api/internal/worker -H "Authorization: Bearer $CRON_SECRET"
```

**Promote a user to admin**
```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='<existing-or-new>' npm run seed:admin
```

**Recreate indexes** (after a schema change)
```bash
npm run db:indexes
```

**Inspect / retry the dead-letter queue** — `/admin` → Dead-letter queue, or:
```bash
curl -X POST https://<host>/api/v1/admin/dead-letters -b cookie.txt \
  -H 'content-type: application/json' -d '{"id":"<id>","action":"retry"}'
```

## Alerts to wire (when you have a monitor)

| Signal | Source | Threshold |
|---|---|---|
| 5xx rate | `/metrics` `http.requests{status="5xx"}` / total | > 1% for 5 min |
| Redirect p95 | `/metrics` `latency."http.redirect".p95` | > 150 ms |
| Outbox backlog | `/api/v1/admin/stats` `queue.outboxPending` | > 5000 |
| DLQ growth | `queue.deadLetters` | any increase |
| `/ready` | HTTP | non-200 for 2 min |
| Cache hit ratio | `stats.performance.cacheHitRatio` | < 0.7 sustained (with Redis on) |

## Incident: redirects returning 5xx

1. `GET /ready` — is Mongo up?
2. If Mongo down: check Atlas status page; the app self-heals on reconnect. Cached links keep working.
3. If Mongo up: check `/metrics` breaker states; check recent deploy; check `/admin` chaos switches are all **off** (someone may have left `mongoDown` on).
4. Roll back: Vercel dashboard → Deployments → previous → "Promote to Production".

## Deploy & rollback

- `main` → production (auto on push).
- PRs → preview deployments.
- Rollback = promote the previous deployment in the Vercel UI (instant, no rebuild).
- Post-deploy: CI runs `npm run db:indexes` against production (safe/idempotent).
