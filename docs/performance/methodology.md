# Benchmark methodology (Plan §57, §58)

> "Do not claim an architecture is better without measurements."

## Rules

1. **Change one variable at a time.** Cache on/off, index on/off, sync/async analytics.
2. **Warm up** before measuring (JIT, connection pool, cache fill) — discard the first 10 %.
3. **Report the distribution**, not the mean: p50 / p95 / p99, plus error rate and RPS.
4. **Same dataset, same host, same time window.** Preview deployment against a seeded DB.
5. **Record raw numbers** in `docs/experiments/<date>-<name>.md` with the exact command.

## Scenarios to run (Plan §58)

| # | A | B | Expectation |
|---|---|---|---|
| 1 | Mongo only | Mongo + Redis cache | B: lower p50, much lower p99 on hot keys; DB ops ↓ |
| 2 | Sync analytics (`FEATURE_ASYNC_ANALYTICS=false`) | Async (outbox) | B: redirect p95 ↓ (no analytics write on the path) |
| 3 | Unindexed search (regex, no index) | Indexed (`$text` / field index) | B: `IXSCAN` not `COLLSCAN`, docs examined ≈ returned |
| 4 | Rate limiting off | Redis token bucket on | cost of the limiter check (should be < 2 ms) |

## Tools

- **k6** for HTTP load — scripts in [`/load-tests`](../../load-tests).
- **`/api/v1/admin/bench`** for a focused in-process Mongo-vs-Redis resolve comparison (100 iterations, returns p50/p95/p99 for each). Surfaced in `/admin/performance`.
- **`.explain("executionStats")`** in `mongosh` for query plans (scenario 3).
- **`/metrics`** before/after snapshots for cache hit ratio, latency buckets, DB op counters.

## Query-plan checklist (Plan §59)

```js
db.urls.find({ shortCode: "Ab3xK9p" }).explain("executionStats")
// want: stage IXSCAN on shortCode_1, totalKeysExamined 1, totalDocsExamined 1, executionTimeMillis < 5

db.url_events.find({ urlId: ObjectId("..."), timestamp: { $gte: ISODate("...") } })
             .sort({ timestamp: -1 }).explain("executionStats")
// want: IXSCAN on urlId_1_timestamp_-1, no in-memory SORT
```

## Template — `docs/experiments/<date>-<name>.md`

```md
# <date> — <scenario>
Host: <preview url> · DB: <cluster/tier> · Dataset: <n urls, m events>
Command: `k6 run load-tests/redirect.js --env BASE=...`

| variant | RPS | p50 | p95 | p99 | err% | cache hit | db ops/req |
|---|---|---|---|---|---|---|---|
| A | | | | | | | |
| B | | | | | | | |

Conclusion: <1–2 sentences with the number>
```
