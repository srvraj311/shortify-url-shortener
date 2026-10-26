# Architecture Decision Records

Short, dated records of decisions that were not obvious. Format: Context → Decision → Consequences.

| # | Decision | Status |
|---|---|---|
| [0001](./0001-nextjs-over-spring-boot.md) | Next.js on Vercel, not Spring Boot | Accepted |
| [0002](./0002-keep-monorepo-flat.md) | Keep the repo flat, V0 under `legacy/` | Accepted |
| [0003](./0003-random-base62-shortcodes.md) | Random Base62 codes, unique index as authority | Accepted |
| [0004](./0004-opaque-cookie-sessions.md) | Opaque HttpOnly cookie sessions, not JWT | Accepted |
| [0005](./0005-transactional-outbox.md) | Transactional outbox + cron/opportunistic drain | Accepted |
| [0006](./0006-redis-optional.md) | Redis is optional; degrade to Mongo-only | Accepted |
| [0007](./0007-hobby-cron-limits.md) | One daily cron + opportunistic draining | Accepted |
