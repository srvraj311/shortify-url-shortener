import type { ClientSession } from "mongoose";
import { randomUUID } from "node:crypto";
import { OutboxEvent } from "@/lib/db/models";
import { isFeatureEnabled } from "@/lib/config";
import { isChaosEnabled } from "@/lib/failure-injection";
import { getContext } from "@/lib/request-context";
import { logger } from "@/lib/logger";
import { incr } from "@/lib/metrics";

/**
 * Event emission via the transactional outbox (Plan §26, §28).
 *
 * `emitEvent` only ever writes a row to `outbox_events` (optionally inside the
 * caller's Mongo transaction). A cron-driven worker drains the outbox and fans
 * events to consumers. This guarantees at-least-once publication even if the
 * process dies immediately after the domain write commits.
 *
 * When `FEATURE_ASYNC_ANALYTICS=false` the redirect path processes analytics
 * inline instead — that's the "synchronous baseline" the plan wants measured
 * before/after (Plan §58).
 */

export type EventType =
  | "URL_CLICKED"
  | "URL_CREATED"
  | "URL_UPDATED"
  | "URL_DELETED"
  | "USER_REGISTERED"
  | "ABUSE_REPORTED";

export interface DomainEvent<T = Record<string, unknown>> {
  eventId: string;
  eventType: EventType;
  payload: T;
  requestId?: string;
  occurredAt: string;
}

export function buildEvent<T extends Record<string, unknown>>(
  eventType: EventType,
  payload: T,
): DomainEvent<T> {
  return {
    eventId: `evt_${randomUUID().replace(/-/g, "")}`,
    eventType,
    payload,
    requestId: getContext()?.requestId,
    occurredAt: new Date().toISOString(),
  };
}

export async function emitEvent(
  eventType: EventType,
  payload: Record<string, unknown>,
  opts: { session?: ClientSession } = {},
): Promise<DomainEvent> {
  const event = buildEvent(eventType, payload);

  if (await isChaosEnabled("queueDown")) {
    // Simulated queue outage: the domain write already succeeded; log and drop
    // the *direct* publish. A real deployment relies on the outbox drain to
    // recover — which we still attempt below unless Mongo itself is the sink.
    logger.warn("events.queue_chaos_down", { eventType });
  }

  await OutboxEvent.create(
    [
      {
        eventId: event.eventId,
        eventType: event.eventType,
        payload: { ...event.payload, requestId: event.requestId, occurredAt: event.occurredAt },
        status: "PENDING",
        availableAt: new Date(),
      },
    ],
    opts.session ? { session: opts.session } : {},
  );
  incr("events.emitted", 1, { type: eventType });

  // If async analytics is disabled, drain this one event right now so the
  // redirect's analytics are visible immediately (synchronous baseline).
  if (eventType === "URL_CLICKED" && !isFeatureEnabled("FEATURE_ASYNC_ANALYTICS")) {
    const { drainOutboxOnce } = await import("@/server/workers/outbox-worker");
    await drainOutboxOnce({ max: 5 }).catch((err) =>
      logger.warn("events.sync_drain_failed", { err }),
    );
  }

  return event;
}
