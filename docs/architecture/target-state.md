# Target state

## Deployment topology (Vercel Hobby)

```
                         Internet
                            |
                   Vercel Edge Network (CDN, TLS)
                            |
            ┌───────────────┴───────────────┐
            v                               v
   Next.js RSC / static UI          Route Handlers (Node fns)
                                            |
              ┌─────────────────────────────┼───────────────────────────┐
              v                             v                           v
   Edge middleware              Auth (cookie / API key)          Zod validation
   (request-id, CORS, CSP)      RBAC (USER / ADMIN)              SSRF guard
              |                             |
              |                        Rate limiter ── Upstash Redis (token bucket)
              |                             |
              └──────────────┬──────────────┘
                             v
                        URL service
                             |
            ┌────────────────┼─────────────────┐
            v                v                 v
     Upstash Redis     MongoDB Atlas     Transactional outbox
      (cache-aside)   urls / users /       (outbox_events)
                      url_events / ...            |
                             ▲                    v
                             |          Opportunistic drain (after())
                             |          + daily Vercel Cron  ── /api/internal/cron
                             |                    |
                             |     ┌──────────────┼──────────────┐
                             |     v              v              v
                             |  analytics      abuse         aggregation
                             |  consumer      consumer         worker
                             |  (idempotent)  (idempotent)   (locked, §79)
                             |     |                             |
                             |     v                             v
                             └── url_events                 url_daily_stats
                                                                 |
                                                                 v
                                                          Dashboard / analytics
```

Cross-cutting: structured logs · `/metrics` · request IDs · audit log · security headers · feature flags · CI/CD · Atlas backups.

## Why each component earns its place (Plan core principle)

| Component | Concrete justification |
|---|---|
| **Next.js on Vercel** | The plan is explicitly Vercel-centric (edge middleware, functions, cron). Spring Boot has no runtime on Vercel. One deploy unit, first-class serverless primitives. |
| **MongoDB Atlas** | Already in use; flexible event/metadata documents; TTL indexes for retention; free tier. |
| **Upstash Redis** | Once >1 serverless instance serves traffic, an in-process rate-limit counter or cache is wrong (Plan §17, §61). Redis is the shared, low-latency store for buckets + hot redirects. REST client works in every runtime. |
| **Transactional outbox** | "DB write succeeds, event publish fails" is a real failure mode (Plan §28). Writing the event in the same transaction, then draining, gives at-least-once publication. |
| **Idempotent consumers + `processed_events`** | At-least-once delivery ⇒ duplicates are guaranteed; the `(consumer, eventId)` unique index makes reprocessing a no-op (Plan §27). |
| **Dead-letter queue** | A poison event must not block the queue forever; after N attempts it parks in `dead_letters` for an admin (Plan §29). |
| **Read model `url_daily_stats`** | The dashboard must not scan every raw event (Plan §25, §77). Pre-aggregation trades freshness (eventual) for cheap reads. |
| **Circuit breaker + timeouts** | Repeated dependency failure should fail fast with a fallback, not pile up latency (Plan §31, §32). |
| **Chaos switches** | You can't claim graceful degradation you never exercised (Plan §33). |

## What is deliberately NOT built

- No Kafka/SQS: the outbox + cron + opportunistic drain covers the plan's queue semantics on the free tier. Swappable behind `events.service.ts`.
- No dedicated search cluster: Mongo indexes + `$text` (Plan §21 V1/V2). The eventual-consistency story is documented for V3.
- No sharding: single Atlas deployment. Sharding strategy is documented ([scaling.md](./scaling.md)), not implemented — "do not prematurely shard" (Plan §73).
- No metadata-fetch/unfurl: would require the full SSRF story to be load-bearing; the guard exists (`assertNotSsrf`) but nothing calls it yet (Plan §36).
