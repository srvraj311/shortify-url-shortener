# Disaster recovery (Plan §80, §81)

## RPO / RTO targets (reference deployment)

| Data class | RPO (max loss) | RTO (max downtime) | Rationale |
|---|---|---|---|
| User accounts | 24 h | 1 h | Atlas daily snapshot; re-registration is possible but painful. |
| URL mappings | 24 h | 1 h | **Highest durability need** — a lost mapping breaks every printed/shared link. `w:majority` writes + daily snapshot. |
| Raw analytics events | 24 h, lossy OK | 4 h | Diagnostic data; some loss acceptable (Plan §80). |
| `url_daily_stats` | ∞ (derived) | n/a | Rebuildable from `url_events` via `/api/internal/aggregate`. |
| Redis (cache + buckets) | total loss OK | 0 | Rebuilds on demand; app degrades to Mongo-only meanwhile. |
| Outbox / queue | 24 h | 4 h | In Mongo, so covered by the snapshot; unpublished events replay on restore. |

## Backup strategy

- **MongoDB Atlas**: enable Cloud Backup (continuous or daily snapshot). Free M0 has limited backup — for a real deployment use ≥ M10 with point-in-time recovery.
- **Redis (Upstash)**: no backup needed by design.
- **Code + config**: git (`main`) + Vercel env vars (export a copy to a secure vault; Vercel has no built-in env export/versioning).
- **Secrets**: `AUTH_SECRET`, `CRON_SECRET`, `MONGODB_URI`, Upstash tokens — store in a password manager; rotating `AUTH_SECRET` invalidates all sessions and changes every `ipHash` (analytics uniqueness resets — acceptable).

## Restore procedure (Mongo total loss)

1. Atlas → Restore snapshot to a new cluster (or in place).
2. Update `MONGODB_URI` in Vercel → redeploy (or just restart functions).
3. `npm run db:indexes` against the restored DB.
4. `POST /api/internal/aggregate` to rebuild `url_daily_stats` from restored events.
5. Verify: `/ready` 200, a known short code redirects, `/admin/stats` sane.

## Restore testing (Plan §81)

> "A backup strategy is incomplete if restoration has never been tested."

Quarterly: restore the latest snapshot to a scratch cluster, point a *preview*
deployment at it, run `load-tests/smoke.js`, confirm redirect + create + analytics.
Record the actual RTO achieved in `docs/experiments/`.
