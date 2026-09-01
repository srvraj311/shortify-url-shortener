import { Types } from "mongoose";
import { UrlEvent, Url, ProcessedEvent } from "@/lib/db/models";
import { logger } from "@/lib/logger";
import { incr } from "@/lib/metrics";
import { isChaosEnabled } from "@/lib/failure-injection";
import { AppError } from "@/lib/errors";

const CONSUMER = "analytics";

/**
 * Idempotent analytics consumer (Plan §23, §27). Turns a URL_CLICKED event into
 * a persisted `url_events` row and bumps the denormalised clickCount. Safe to
 * call twice for the same eventId — the ProcessedEvent unique index dedupes.
 */
export async function handleClickEvent(event: {
  eventId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  if (await isChaosEnabled("analyticsDown")) {
    // Force a retry; the redirect already succeeded, so this only delays stats.
    throw new AppError("SERVICE_UNAVAILABLE", "Injected analytics outage", { retryable: true });
  }

  // Dedupe: claim the (consumer, eventId) pair first.
  try {
    await ProcessedEvent.create({ consumer: CONSUMER, eventId: event.eventId });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      incr("analytics.duplicate_skipped");
      logger.debug("analytics.duplicate", { eventId: event.eventId });
      return;
    }
    throw err;
  }

  const p = event.payload as {
    urlId: string;
    shortCode: string;
    userId?: string | null;
    ipHash?: string;
    country?: string | null;
    city?: string | null;
    userAgent?: string | null;
    device?: string | null;
    browser?: string | null;
    os?: string | null;
    referrerDomain?: string | null;
    isBot?: boolean;
    requestId?: string;
    occurredAt?: string;
  };

  try {
    await UrlEvent.create({
      eventId: event.eventId,
      eventType: "URL_CLICKED",
      urlId: new Types.ObjectId(p.urlId),
      shortCode: p.shortCode,
      userId: p.userId ? new Types.ObjectId(p.userId) : null,
      timestamp: p.occurredAt ? new Date(p.occurredAt) : new Date(),
      requestId: p.requestId,
      ipHash: p.ipHash,
      country: p.country ?? null,
      city: p.city ?? null,
      userAgent: p.userAgent ?? null,
      device: p.device ?? null,
      browser: p.browser ?? null,
      os: p.os ?? null,
      referrerDomain: p.referrerDomain ?? null,
      isBot: p.isBot ?? false,
    });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      // url_events.eventId unique — another attempt already wrote it.
      incr("analytics.duplicate_skipped");
      return;
    }
    // Undo the dedupe claim so a retry can re-process.
    await ProcessedEvent.deleteOne({ consumer: CONSUMER, eventId: event.eventId }).catch(() => {});
    throw err;
  }

  await Url.updateOne({ _id: new Types.ObjectId(p.urlId) }, { $inc: { clickCount: 1 } });
  incr("analytics.events_processed");
}
