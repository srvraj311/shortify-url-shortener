# 0005 — Transactional outbox + drain

**Date:** 2026-09-02 · **Status:** Accepted

## Context
Plan §26–§29. "DB write succeeds, event publish fails" must not lose events.
No Kafka/SQS on the free tier.

## Decision
`emitEvent()` inserts a row into `outbox_events` (optionally in the caller's
Mongo transaction). A drain (`drainOutboxOnce`) claims rows atomically
(`findOneAndUpdate` → PROCESSING), fans to consumers, marks PUBLISHED. Failures
back off; 5 attempts → `dead_letters`. Consumers dedupe via
`processed_events (consumer, eventId)` unique index.

## Consequences
- At-least-once publication; effectively-once processing.
- The "queue" is Mongo — no extra infra, inherits Mongo's durability.
- Throughput is bounded by drain frequency (see ADR 0007). Fine for this scale;
  swap `events.service.ts` for QStash/SQS if it isn't.
