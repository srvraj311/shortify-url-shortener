# 0004 — Opaque HttpOnly cookie sessions, not JWT

**Date:** 2026-09-02 · **Status:** Accepted

## Context
Plan §14: "For a browser application, a secure HttpOnly cookie/session model is
a strong option."

## Decision
Random 32-byte token in an HttpOnly, Secure, SameSite=Lax cookie. Server stores
only `sha256(token)` in `sessions` with a TTL index. `/auth/refresh` slides the
expiry.

## Consequences
- Instant revocation (delete the row) — impossible with stateless JWT.
- One indexed lookup per authenticated request (cheap; `lastUsedAt` throttled to
  1/min to avoid a write per request).
- No refresh-token rotation complexity.
- API clients use API keys (`usk_...`, hashed) instead of carrying cookies.
