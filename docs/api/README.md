# API reference

Base: `https://<host>/api/v1` · All bodies + responses are JSON · Version in the path from day one (Plan §12).

## Auth

Two mechanisms:
- **Session cookie** (`sid`, HttpOnly) — set by `/auth/login` & `/auth/register`, used by the web UI.
- **API key** — `Authorization: Bearer usk_...`. Create at `/settings/api-keys`. Shown once.

## Error contract (Plan §13)

```json
{ "error": { "code": "URL_NOT_FOUND", "message": "Short URL does not exist", "requestId": "req_ab12…", "details": [] } }
```
Codes: `VALIDATION_ERROR UNAUTHORIZED FORBIDDEN NOT_FOUND URL_NOT_FOUND URL_EXPIRED URL_DISABLED ALIAS_TAKEN ALIAS_RESERVED RATE_LIMITED DUPLICATE_REQUEST CONFLICT PAYLOAD_TOO_LARGE UNSUPPORTED_URL SSRF_BLOCKED INTERNAL_ERROR SERVICE_UNAVAILABLE DEPENDENCY_TIMEOUT`.

Every response carries `X-Request-Id`. Rate-limited responses carry `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

## Idempotency (Plan §71)

Send `Idempotency-Key: <8–128 url-safe chars>` on `POST /urls`. Same key + same body ⇒ the original response is replayed (`Idempotent-Replayed: true`). Same key + different body ⇒ `DUPLICATE_REQUEST`.

## Endpoints

### Auth
| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/auth/register` | — | `{ email, password }` |
| POST | `/auth/login` | — | `{ email, password }` |
| POST | `/auth/logout` | cookie | — |
| POST | `/auth/refresh` | cookie | — |
| GET | `/auth/me` | any | — |

### URLs
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/urls` | optional | `{ url, alias?, expiresAt?, title?, visibility? }`. Anonymous allowed. |
| GET | `/urls?limit=&cursor=&status=&search=` | required | cursor pagination |
| GET | `/urls/:id` | owner/admin | |
| PATCH | `/urls/:id` | owner/admin | `{ version, status?, expiresAt?, title?, visibility?, tags? }` — `version` required (optimistic concurrency → 409 on mismatch) |
| DELETE | `/urls/:id` | owner/admin | |
| GET | `/urls/:id/analytics` | owner/admin | summary |
| GET | `/urls/:id/analytics/daily?days=` | owner/admin | time-series from read model |
| GET | `/urls/:id/qr` | owner/admin | `image/png` |
| POST | `/urls/:id/report` | optional | `{ reason, detail? }` |

### API keys
`GET /api-keys` · `POST /api-keys {name, expiresInDays?}` (returns raw `key` once) · `DELETE /api-keys/:id`

### Admin (role: ADMIN)
`GET /admin/stats` · `GET /admin/audit-logs` · `GET /admin/rate-limits` · `GET|POST /admin/chaos` · `GET|POST /admin/dead-letters` · `PATCH /admin/urls/:id/status` · `GET /admin/abuse-reports` · `PATCH /admin/abuse-reports/:id` · `PATCH /admin/users/:id/status` · `POST /admin/bench`

### System
`GET /health` · `GET /ready` · `GET /metrics` · `GET /:shortCode` (redirect, 302 / 404 / 410)

## Examples

```bash
# create (anonymous)
curl -X POST https://<host>/api/v1/urls -H 'content-type: application/json' \
  -d '{"url":"https://example.com/long"}'

# create with an API key + idempotency
curl -X POST https://<host>/api/v1/urls \
  -H "authorization: Bearer $KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: order-42' -d '{"url":"https://example.com","alias":"promo"}'

# list your URLs
curl -H "authorization: Bearer $KEY" 'https://<host>/api/v1/urls?limit=20'
```

```javascript
const res = await fetch(`${BASE}/api/v1/urls`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ url: "https://example.com" }),
});
const { url } = await res.json();
```

```python
import requests
r = requests.post(f"{BASE}/api/v1/urls",
                  headers={"Authorization": f"Bearer {KEY}"},
                  json={"url": "https://example.com"})
print(r.json()["url"]["shortUrl"])
```

See [`openapi.yaml`](./openapi.yaml) for the machine-readable spec.
