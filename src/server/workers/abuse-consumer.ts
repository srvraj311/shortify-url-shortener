import { Types } from "mongoose";
import { Url, ProcessedEvent } from "@/lib/db/models";
import { incr } from "@/lib/metrics";
import { logger } from "@/lib/logger";

const CONSUMER = "abuse";

/**
 * Abuse worker (Plan §26, §38, §39). Consumes URL_CREATED / ABUSE_REPORTED and
 * updates the URL's abuseScore; auto-flags past a threshold. Idempotent.
 */
export async function handleAbuseEvent(event: {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await ProcessedEvent.create({ consumer: CONSUMER, eventId: event.eventId });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) return;
    throw err;
  }

  const p = event.payload as { urlId?: string };
  if (!p.urlId || !Types.ObjectId.isValid(p.urlId)) return;

  if (event.eventType === "ABUSE_REPORTED") {
    const doc = await Url.findByIdAndUpdate(
      p.urlId,
      { $inc: { abuseScore: 3 } },
      { new: true },
    );
    if (doc && doc.abuseScore >= 6 && doc.status === "ACTIVE") {
      doc.status = "FLAGGED";
      doc.flagReason = "auto:abuse-reports";
      await doc.save();
      incr("abuse.auto_flagged");
      logger.warn("abuse.auto_flagged", { urlId: p.urlId, score: doc.abuseScore });
    }
  }
  incr("abuse.events_processed");
}
