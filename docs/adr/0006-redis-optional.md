# 0006 — Redis is optional; degrade to Mongo-only

**Date:** 2026-09-02 · **Status:** Accepted

## Context
Plan §33/§84: "What if Redis dies? Fallback to MongoDB where safe. System
remains functional." The free tier may not always have Redis provisioned.

## Decision
Every Redis call goes through `withRedis(op, fallback, {timeoutMs})`. No env
vars → `redisAvailable()` is false → cache-aside calls the loader directly,
rate limiter uses a per-instance in-memory token bucket, metrics use a local
snapshot. A chaos switch (`redisDown`) forces the same path.

## Consequences
- The app boots and passes `/ready` with no Redis at all.
- Rate limiting is weaker (per-instance) without Redis — documented, acceptable
  for a reference deployment; add Upstash to make it correct.
- Slightly more Mongo load on the redirect path when the cache is absent.
