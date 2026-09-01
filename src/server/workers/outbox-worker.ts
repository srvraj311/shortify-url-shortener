import { OutboxEvent, DeadLetter, type OutboxEventDoc } from "@/lib/db/models";
import { logger } from "@/lib/logger";
import { incr, observeLatency } from "@/lib/metrics";
import { handleClickEvent } from "./analytics-consumer";
import { handleAbuseEvent } from "./abuse-consumer";

/**
 * Outbox drain (Plan §26–§29).
 *
 * Claims a batch of PENDING rows (atomic findOneAndUpdate → PROCESSING), fans
 * each event to its consumers, and on success marks PUBLISHED. Failures get
 * exponential backoff via `availableAt`; after MAX_ATTEMPTS the event is moved
 * to the dead-letter collection for an admin to inspect / retry / discard.
 */

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [0, 2_000, 10_000, 30_000, 120_000];

type Consumer = (e: { eventId: string; eventType: string; payload: Record<string, unknown> }) => Promise<void>;

const ROUTES: Record<string, Consumer[]> = {
  URL_CLICKED: [handleClickEvent as Consumer],
  URL_CREATED: [handleAbuseEvent],
  ABUSE_REPORTED: [handleAbuseEvent],
  URL_UPDATED: [],
  URL_DELETED: [],
  USER_REGISTERED: [],
};

export interface DrainResult {
  claimed: number;
  published: number;
  retried: number;
  deadLettered: number;
}

export async function drainOutboxOnce(opts: { max?: number } = {}): Promise<DrainResult> {
  const max = opts.max ?? 50;
  const result: DrainResult = { claimed: 0, published: 0, retried: 0, deadLettered: 0 };
  const start = performance.now();

  for (let i = 0; i < max; i++) {
    const claimed = await claimNext();
    if (!claimed) break;
    result.claimed++;
    const outcome = await processEvent(claimed);
    result[outcome]++;
  }

  observeLatency("worker.outbox.drain", performance.now() - start);
  if (result.claimed > 0) logger.info("worker.outbox.drained", { ...result });
  return result;
}

async function claimNext(): Promise<OutboxEventDoc | null> {
  return OutboxEvent.findOneAndUpdate(
    { status: "PENDING", availableAt: { $lte: new Date() } },
    { $set: { status: "PROCESSING", lockedAt: new Date() }, $inc: { attempts: 1 } },
    { sort: { availableAt: 1, createdAt: 1 }, new: true },
  );
}

async function processEvent(evt: OutboxEventDoc): Promise<"published" | "retried" | "deadLettered"> {
  const consumers = ROUTES[evt.eventType] ?? [];
  try {
    for (const consume of consumers) {
      await consume({
        eventId: evt.eventId,
        eventType: evt.eventType,
        payload: evt.payload as Record<string, unknown>,
      });
    }
    await OutboxEvent.updateOne(
      { _id: evt._id },
      { $set: { status: "PUBLISHED", publishedAt: new Date(), lastError: null } },
    );
    incr("worker.outbox.published", 1, { type: evt.eventType });
    return "published";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (evt.attempts >= MAX_ATTEMPTS) {
      await DeadLetter.create({
        eventId: evt.eventId,
        eventType: evt.eventType,
        consumer: "outbox",
        payload: evt.payload,
        error: message,
        attempts: evt.attempts,
        firstFailedAt: evt.lockedAt ?? evt.createdAt,
      });
      await OutboxEvent.updateOne({ _id: evt._id }, { $set: { status: "DEAD", lastError: message } });
      incr("worker.outbox.dead_lettered", 1, { type: evt.eventType });
      logger.error("worker.outbox.dead_letter", { eventId: evt.eventId, attempts: evt.attempts, err: message });
      return "deadLettered";
    }

    const backoff = BACKOFF_MS[Math.min(evt.attempts, BACKOFF_MS.length - 1)];
    await OutboxEvent.updateOne(
      { _id: evt._id },
      {
        $set: {
          status: "PENDING",
          availableAt: new Date(Date.now() + backoff),
          lastError: message,
        },
      },
    );
    incr("worker.outbox.retry", 1, { type: evt.eventType });
    logger.warn("worker.outbox.retry", { eventId: evt.eventId, attempt: evt.attempts, backoffMs: backoff });
    return "retried";
  }
}

/** Requeue a dead letter (admin action, Plan §29). */
export async function retryDeadLetter(deadLetterId: string): Promise<boolean> {
  const dl = await DeadLetter.findById(deadLetterId);
  if (!dl || dl.status !== "OPEN") return false;
  await OutboxEvent.updateOne(
    { eventId: dl.eventId },
    { $set: { status: "PENDING", availableAt: new Date(), attempts: 0, lastError: null } },
    { upsert: false },
  );
  // If the outbox row was TTL'd away, recreate it.
  const exists = await OutboxEvent.exists({ eventId: dl.eventId });
  if (!exists) {
    await OutboxEvent.create({
      eventId: dl.eventId,
      eventType: dl.eventType,
      payload: dl.payload,
      status: "PENDING",
      availableAt: new Date(),
    });
  }
  await DeadLetter.updateOne({ _id: dl._id }, { $set: { status: "RETRIED" } });
  return true;
}
