# Failure diagrams (Plan §72)

For each: **failure → detection → fallback → recovery → user impact**. Exercise every row from `/admin` → Failure simulation.

## Redis unavailable

| | |
|---|---|
| Failure | Upstash unreachable, or chaos `redisDown`. |
| Detection | `withRedis()` timeout (≤800 ms) or thrown error; caught, logged `redis.op_failed`. |
| Fallback | Cache-aside skips straight to Mongo. Rate limiter falls back to a **per-instance** in-memory bucket (weaker, logged). |
| Recovery | Next call re-tries Redis; no manual step. |
| User impact | Redirects a few ms slower (Mongo instead of cache). Rate limiting less precise across instances. No errors. |

## MongoDB unavailable

| | |
|---|---|
| Failure | Atlas outage / connection storm / chaos `mongoDown`. |
| Detection | `serverSelectionTimeoutMS` (5 s); `/ready` returns 503. |
| Fallback | Redirects that **hit the cache** still succeed. Cache misses and all writes return `SERVICE_UNAVAILABLE` with a request id — no stack traces. |
| Recovery | Connection promise is reset on failure so a later request reconnects. `/ready` flips back to 200. |
| User impact | Popular links keep working; long-tail links and creates fail cleanly until Atlas returns. |

## Queue / worker cannot keep up (backpressure, Plan §30)

| | |
|---|---|
| Failure | Click rate ≫ drain rate; `outbox_events` PENDING count grows. |
| Detection | `/metrics` `worker.outbox.*`; admin stats `queue.outboxPending`. |
| Fallback | Redirects are unaffected (they only *insert* an outbox row). Drain batches are bounded; work simply lags. |
| Recovery | Increase drain frequency / batch size; the daily cron does a full catch-up loop. Low-value telemetry could be sampled (documented, not enabled). |
| User impact | Analytics dashboards lag by minutes. No redirect impact. |

## Duplicate event delivery

| | |
|---|---|
| Failure | Outbox row processed twice (retry after a partial success). |
| Detection | `processed_events` unique `(consumer, eventId)` insert throws 11000. |
| Fallback | Consumer returns early: `analytics.duplicate_skipped`. `url_events.eventId` unique is a second guard. |
| Recovery | n/a — this is the designed steady state. |
| User impact | None. Counts stay correct. |

## Duplicate request (client retry)

| | |
|---|---|
| Failure | Client retries `POST /api/v1/urls` after a timeout. |
| Detection | Same `Idempotency-Key` → unique `(scope, ownerId, key)` insert throws 11000. |
| Fallback | Stored response replayed with `Idempotent-Replayed: true`; different body → `DUPLICATE_REQUEST`. |
| Recovery | n/a. |
| User impact | Exactly one URL created; client gets the original result. |

## Alias race

| | |
|---|---|
| Failure | Two requests ask for alias `promo` simultaneously. |
| Detection | Second `insert` hits `urls.shortCode` unique index (11000). |
| Fallback | Loser gets `409 ALIAS_TAKEN`. No check-then-insert window. |
| User impact | One winner, one clear error. |

## Cache stampede (Plan §19)

| | |
|---|---|
| Failure | A hot key's TTL expires; thousands of concurrent misses. |
| Detection | Miss count spike. |
| Fallback | Per-instance single-flight (`coalesced()`) collapses N misses → 1 Mongo read per instance; jittered TTL desynchronises expiry across keys. |
| Residual | Up to (instance count) concurrent reads — acceptable; a distributed lock is the next lever if needed. |
| User impact | Negligible latency blip. |

## Hot key / viral link (Plan §20)

Mitigations in place: Redis cache, per-instance single-flight, jittered TTL, `Cache-Control` lets the edge/CDN absorb repeats. Next levers (documented): key replication (`url:{code}:{0..n}`), longer TTL for high-`clickCount` URLs, edge-cached redirects.

## Analytics subsystem down

Redirect returns 302 immediately (event is emitted in `after()`); the outbox row persists and retries with backoff; after 5 attempts → DLQ. Zero redirect impact.
