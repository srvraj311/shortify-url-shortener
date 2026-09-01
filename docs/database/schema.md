# Database schema

MongoDB, database `url-shortener-v1`. Models: [`src/lib/db/models`](../../src/lib/db/models).

## Collections

### `users`
`email` (unique), `passwordHash` (bcrypt cost 12), `role` USER|ADMIN, `status` ACTIVE|SUSPENDED|BANNED, `displayName`, `lastLoginAt`, timestamps.

### `sessions`
`userId`, `sessionHash` = sha256(cookie token) (unique), `ipHash`, `userAgent`, `expiresAt` (**TTL index**), `revokedAt`.

### `api_keys`
`userId`, `name`, `keyHash` = sha256(raw) (unique), `prefix` (`usk_xxxxxxxx`, non-secret), `status`, `scopes`, `lastUsedAt`, `expiresAt`.

### `urls` — write model
`shortCode` (**unique**), `originalUrl`, `normalizedUrl`, `domain`, `userId` (nullable = anonymous), `createdByIpHash`, `status` ACTIVE|DISABLED|EXPIRED|FLAGGED, `visibility`, `type` RANDOM|ALIAS, `customAlias`, `title`, `tags`, `expiresAt`, `clickCount` (denormalised), `abuseScore`, `flagReason`, `version` (optimistic concurrency), timestamps.

### `url_events` — event stream / raw analytics
`eventId` (**unique**, consumer idempotency), `eventType`, `urlId`, `shortCode`, `userId`, `timestamp`, `requestId`, `ipHash` (never raw IP), `country`, `city`, `device`, `browser`, `os`, `referrerDomain`, `isBot`.

### `url_daily_stats` — read model
`(urlId, date)` (**unique**), `clicks`, `uniqueVisitors`, `botClicks`, `byDevice/byBrowser/byOs/byCountry/byReferrer` maps. Rebuilt by the aggregation worker.

### `idempotency_keys`
`(scope, ownerId, key)` (**unique**), `requestHash`, `status`, `statusCode`, `response`, `expiresAt` (**TTL**).

### `outbox_events`
`eventId` (**unique**), `eventType`, `payload`, `status` PENDING|PROCESSING|PUBLISHED|DEAD, `attempts`, `availableAt` (backoff gate), `lastError`, `publishedAt` (**TTL 1d after publish**).

### `processed_events`
`(consumer, eventId)` (**unique**), `processedAt` (**TTL 7d**). The dedupe log.

### `dead_letters`
`eventId`, `eventType`, `consumer`, `payload`, `error`, `attempts`, `firstFailedAt`, `status` OPEN|RETRIED|DISCARDED.

### `audit_logs`
`actorId`, `actorType`, `action`, `resourceType`, `resourceId`, `requestId`, `ipHash`, `metadata`, `timestamp`. Append-only.

### `abuse_reports`
`urlId`, `shortCode`, `reporterId` | `reporterIpHash`, `reason`, `detail`, `status` OPEN|REVIEWING|ACTIONED|DISMISSED, `resolvedAt`, `resolvedBy`.

### `system_flags`
Singleton `_id: "global"` — feature overrides + chaos switches (fallback when Redis absent).

## Data lifecycle / retention (Plan §41)

| Data | Retention | Mechanism |
|---|---|---|
| Sessions | until `expiresAt` (7d sliding) | TTL index |
| Raw `url_events` | `ANALYTICS_EVENT_TTL_DAYS` (default 90) | TTL index `raw_event_ttl` |
| `idempotency_keys` | 24 h | TTL index |
| `processed_events` | 7 d | TTL index |
| `outbox_events` (published) | 1 d | TTL index |
| `url_daily_stats` | indefinite (small, aggregated) | — |
| `audit_logs` | indefinite (compliance) | manual archival policy |
| Raw IP | **never stored** | HMAC-SHA256 → `ipHash` at ingress |

Account deletion must cascade: urls, api_keys, sessions, and anonymise `url_events.userId` / `audit_logs.actorId` (documented; endpoint not yet built).
