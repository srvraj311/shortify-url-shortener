# Diagrams (Plan §70, §71)

## Level 1 — Product

```mermaid
flowchart LR
  U[User] --> S[Shortify]
  S --> D[(Destination sites)]
```

## Level 2 — Application

```mermaid
flowchart TD
  UI[Next.js UI] --> API[Route Handlers]
  API --> M[(MongoDB)]
  API -.optional.-> R[(Redis)]
```

## Level 3 — Production

```mermaid
flowchart TD
  CDN[Vercel Edge] --> MW[Middleware: req-id / CORS / CSP]
  MW --> WEB[UI]
  MW --> FN[API functions]
  FN --> R[(Upstash Redis)]
  FN --> M[(MongoDB Atlas)]
  FN --> OB[(outbox_events)]
  CRON[Daily Cron + after() drain] --> OB
  CRON --> WK[workers]
  WK --> M
```

## Level 4 — Redirect hot path

```mermaid
flowchart TD
  A[GET /:code] --> RID[request id]
  RID --> RL{rate limit ok?}
  RL -- no --> E429[429 + Retry-After]
  RL -- yes --> LC{local? redis? cache hit}
  LC -- hit --> ST{status ACTIVE & not expired?}
  LC -- miss --> DB[(Mongo findOne shortCode)]
  DB --> SET[Redis SET jittered TTL]
  SET --> ST
  ST -- no --> E410[410 gone page]
  ST -- yes --> R302[302 redirect]
  R302 -.after().-> EV[emit URL_CLICKED -> outbox]
```

## Level 5 — Analytics path

```mermaid
sequenceDiagram
  participant Redirect
  participant Outbox as outbox_events
  participant Worker as drainOutboxOnce
  participant AC as analytics consumer
  participant Events as url_events
  participant Agg as aggregation worker
  participant RM as url_daily_stats
  Redirect->>Outbox: insert(eventId, URL_CLICKED)
  Worker->>Outbox: claim PENDING (findOneAndUpdate)
  Worker->>AC: dispatch
  AC->>AC: insert processed_events (dedupe)
  AC->>Events: insert event, $inc clickCount
  Worker->>Outbox: mark PUBLISHED
  Agg->>Events: aggregate last 26h
  Agg->>RM: upsert (urlId,date)
```

## Sequence — Create URL

```mermaid
sequenceDiagram
  participant C as Client
  participant API
  participant Idem as idempotency
  participant Val as validate+SSRF+blocklist
  participant Svc as url.service
  participant M as Mongo
  C->>API: POST /urls {url, alias?} [Idempotency-Key]
  API->>API: authenticate (optional), rate limit
  API->>Idem: claim key (unique insert)
  Idem-->>API: replay stored response (if duplicate)
  API->>Val: normalize, scheme allowlist, domain blocklist
  API->>Svc: createUrl
  alt alias
    Svc->>M: insert {shortCode: alias}  (unique index resolves race)
    M-->>Svc: 11000 -> ALIAS_TAKEN
  else random
    loop <=5 attempts
      Svc->>M: insert {shortCode: random}
    end
  end
  Svc->>M: insert outbox URL_CREATED
  Svc-->>API: dto
  API->>Idem: store response
```

## Sequence — Redirect, cache miss

```mermaid
sequenceDiagram
  participant C
  participant API
  participant R as Redis
  participant M as Mongo
  C->>API: GET /abc123
  API->>R: GET url:abc123
  R-->>API: nil (miss)
  API->>M: findOne {shortCode: abc123}
  M-->>API: doc
  API->>R: SET url:abc123 (ex: ~3600 ± jitter)
  API-->>C: 302 Location: destination
  API-->>API: after() emit URL_CLICKED
```

## Duplicate request

```mermaid
sequenceDiagram
  participant C
  participant API
  C->>API: POST /urls  Idempotency-Key: k  body B
  API-->>C: 201 {url}   (stored: k -> response, hash(B))
  C->>API: POST /urls  Idempotency-Key: k  body B  (retry)
  API-->>C: 201 {url}  Idempotent-Replayed: true
  C->>API: POST /urls  Idempotency-Key: k  body B'
  API-->>C: 409 DUPLICATE_REQUEST
```
