# 0007 — One daily cron + opportunistic draining

**Date:** 2026-09-02 · **Status:** Accepted

## Context
Vercel Hobby runs cron jobs at most once per day. The outbox needs draining far
more often than daily for analytics to feel live.

## Decision
- `/api/internal/cron` runs once daily: full outbox drain loop + aggregation +
  maintenance sweep. This is the guaranteed backstop.
- Hot requests call `scheduleOpportunisticDrain()` which, in `after()` (post
  response, no latency cost), drains a small batch — gated to ≤1 run / 15 s per
  instance.

## Consequences
- Analytics lag is seconds-to-minutes under traffic, up to ~24 h only if the
  site is completely idle (then nobody's looking anyway).
- On Vercel Pro, add per-minute `/api/internal/worker` cron and drop the
  opportunistic path (or keep it as belt-and-braces).
