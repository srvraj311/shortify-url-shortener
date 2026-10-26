# Scaling strategy (Plan §73)

Ordered by when you'd actually reach for each lever. **Do not prematurely shard.**

| Stage | Trigger | Lever |
|---|---|---|
| 0 (now) | — | Single Atlas deployment (M0), single Upstash DB, stateless Vercel functions that auto-scale horizontally. |
| 1 | p95 DB latency creeping up under normal load | Vertical: bump Atlas tier (M0→M10). Add the indexes the query planner asks for (verify with `.explain()`, see [database/indexes.md](../database/indexes.md)). |
| 2 | Reads dominate; primary CPU-bound | Replica set is already 3-node on Atlas. Route analytics/dashboard reads to secondaries (`readPreference=secondaryPreferred`) — they tolerate lag. Keep redirect resolution on primary or cache. |
| 3 | Redirect QPS high | Lean harder on cache: longer TTL for high-`clickCount` URLs, edge caching of 302s, CDN. Redis is already shared across all instances. |
| 4 | Analytics write volume high | The outbox + workers already scale independently of the API. Increase drain batch size / frequency; batch `url_events` inserts; sample low-value telemetry (Plan §78). |
| 5 | Search needs > Mongo `$text` | Stand up an external index (Atlas Search / OpenSearch) fed by the event stream. Search becomes explicitly eventually consistent. |
| 6 | Single collection too large / write hotspots | **Partition** `url_events` by time (monthly collections) — cheap, natural TTL boundary. |
| 7 | `urls` collection genuinely too big for one shard | **Shard** on a hashed `shortCode` (even distribution, redirect is a point query on the shard key). `url_events` shards on `{ urlId, timestamp }`. |

## Conceptual DB scaling

```
Stage 2:            Stage 7:
  Primary             Shard A (hash shortCode 0x0–0x5)
  ├─ Secondary        Shard B (hash shortCode 0x6–0xA)
  └─ Secondary        Shard C (hash shortCode 0xB–0xF)
                        each shard = its own replica set
```

## Why `shortCode` is a good shard key

- **High cardinality** — 62⁷ space, random generation.
- **Even write distribution** — hashed, no monotonic hotspot (unlike an ObjectId or timestamp prefix).
- **Redirect is a point query** on exactly the shard key → single-shard, no scatter-gather.
- Owner list queries (`userId`) become scatter-gather — acceptable, they're paginated and off the hot path.
