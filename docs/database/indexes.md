# Indexes — query patterns & justification (Plan §8, §59)

> Every index has a storage, write, and maintenance cost. Each one below maps to
> a real query. Verify with `.explain("executionStats")` — target `IXSCAN`,
> `totalKeysExamined ≈ nReturned`, no `COLLSCAN` on the hot paths.

| Collection | Index | Serves | Notes |
|---|---|---|---|
| `users` | `{ email: 1 }` unique | login lookup; registration race | authority for "email taken" |
| `sessions` | `{ sessionHash: 1 }` unique | every authenticated request | |
| | `{ expiresAt: 1 }` TTL 0 | automatic session reaping | |
| `api_keys` | `{ keyHash: 1 }` unique | Bearer auth lookup | |
| | `{ userId: 1, status: 1 }` | "list my keys" | |
| `urls` | `{ shortCode: 1 }` unique | **redirect** (point query); code/alias race | hottest index |
| | `{ userId: 1, createdAt: -1 }` | dashboard list, default sort | supports cursor pagination |
| | `{ userId: 1, status: 1, createdAt: -1 }` | dashboard list + status filter | |
| | `{ expiresAt: 1 }` sparse | expiry sweep | sparse: most URLs never expire |
| | `{ normalizedUrl: 1 }` | abuse: same-destination burst detection | |
| | `url_text` (`$text`) | search V2 | weights: alias/code 10, title 5, url 1 |
| `url_events` | `{ urlId: 1, timestamp: -1 }` | per-URL analytics | |
| | `{ timestamp: 1 }` TTL | global range scans **and** retention | one index, two jobs |
| | `{ eventId: 1 }` unique | consumer idempotency | |
| `url_daily_stats` | `{ urlId: 1, date: 1 }` unique | dashboard time-series read; upsert target | |
| `idempotency_keys` | `{ scope: 1, ownerId: 1, key: 1 }` unique | replay detection | |
| `outbox_events` | `{ status: 1, availableAt: 1 }` | worker claim query | |
| `processed_events` | `{ consumer: 1, eventId: 1 }` unique | dedupe | |

## Deliberately NOT indexed

- `urls.domain` alone — only queried by admins in aggregate, low frequency.
- `audit_logs.metadata.*` — free-form; would be a maintenance trap.
- `url_events` on `country`/`device`/etc. — only read by the aggregation job,
  which does a single time-bounded pass, not point lookups.

## Autoindex policy

`autoIndex` is **on in dev**, **off in production** (`mongoose` default respects
`NODE_ENV`). Production indexes are created explicitly by
`npm run db:indexes` (`syncIndexes` — creates missing, drops undeclared),
run in the CI deploy step.
