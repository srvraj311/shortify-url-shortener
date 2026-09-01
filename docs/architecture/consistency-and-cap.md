# Consistency model & CAP (Plan §74, §75)

## Per-operation consistency choices

| Operation | Model | Rationale |
|---|---|---|
| **URL creation** | Strong. Unique index on `shortCode` is linearizable within the replica set; the write is acknowledged `w:majority`. | A short code must never resolve to two destinations. |
| **Redirect resolution** | Read-your-writes for the owner via cache invalidation on update; otherwise "strong enough" — the cache holds the last committed value with a bounded TTL. | Correctness of the live destination matters; a few seconds of staleness after an edit is acceptable and bounded. |
| **Cache** | Eventually consistent with Mongo. Invalidated on every write; jittered TTL caps staleness. | The cache is an optimisation, never the source of truth (Plan §18). |
| **Analytics counts** | Eventually consistent. `clickCount` is incremented by the async consumer; `url_daily_stats` is recomputed by the aggregation worker. | Redirect latency > analytics freshness. Exact-ish counts within minutes are fine (Plan §23, §78). |
| **Search** | Eventually consistent (index lag is ~0 today with Mongo indexes; becomes real with a V3 external index). | Nobody needs a link to be searchable the instant it's created. |
| **Dashboard aggregates** | Eventually consistent (read model). | Heavy reads must not scan raw events (Plan §77). |
| **Audit log** | Best-effort append. A failed audit write is logged, never fails the audited action. | Availability of the primary action > completeness of the trail. |

## CAP in this system

CAP is about behaviour **during a network partition**. Each dependency sits at a different point.

### MongoDB (replica set) — CP

During a partition that loses the primary, Atlas holds an election. Writes are **unavailable** until a new primary is elected (seconds); the system prefers **consistency** over accepting writes it might lose. Our code surfaces this as `SERVICE_UNAVAILABLE` on creates while cached redirects keep serving. This is the right trade for URL data (Plan §80: "URL data has high durability requirements").

### Redis (single Upstash primary) — effectively CP, but non-critical

If Redis is partitioned away, our clients **time out and fall back** (cache → Mongo, rate limiter → local). We deliberately choose **availability of the product** by treating Redis as optional, accepting **weaker rate-limit accuracy** (an AP-ish choice for that one concern) during the partition.

### The outbox / queue — AP-leaning

The outbox lives in Mongo, so it inherits Mongo's CP write behaviour. But *delivery* is AP in spirit: at-least-once, retried, eventually consistent. A partition between a worker instance and Mongo just means that instance does no work; another picks it up; nothing is lost because the row is only marked `PUBLISHED` after consumers succeed.

### Search index (future) — AP

A dedicated search index would be updated off the event stream. During a partition it serves **stale** results (available) rather than erroring — acceptable for search.

### Analytics store — AP

Losing some diagnostic telemetry during a partition is acceptable (Plan §78, §80). Business-critical counters are derived from `url_events`, which is durable in Mongo.

## Summary

The **hot path prefers availability** (cache + graceful degradation); the **creation path prefers consistency** (unique index, majority writes); the **cold path accepts eventual consistency** to keep the hot path fast.
