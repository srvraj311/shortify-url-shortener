import { Url, IdempotencyKey, OutboxEvent } from "@/lib/db/models";
import { invalidateUrl } from "@/lib/cache";
import { withLock } from "@/lib/lock";
import { logger } from "@/lib/logger";
import { incr } from "@/lib/metrics";

/**
 * Maintenance sweep (Plan §11, §63). TTL indexes handle physical deletion of
 * sessions / raw events / idempotency keys; this job does the work TTL can't:
 * flip expired URLs to EXPIRED status (so redirects 410 immediately instead of
 * waiting for the TTL reaper) and bust their cache entries.
 */
export async function runSweep(): Promise<{ expired: number; idempotencyPurged: number; outboxPurged: number }> {
  const out = { expired: 0, idempotencyPurged: 0, outboxPurged: 0 };

  await withLock("sweep:maintenance", 55_000, async () => {
    const expiring = await Url.find({
      status: "ACTIVE",
      expiresAt: { $ne: null, $lte: new Date() },
    })
      .select("shortCode")
      .limit(500);

    for (const doc of expiring) {
      await Url.updateOne({ _id: doc._id, status: "ACTIVE" }, { $set: { status: "EXPIRED" }, $inc: { version: 1 } });
      await invalidateUrl(doc.shortCode);
      out.expired++;
    }

    // Belt-and-braces cleanup in case TTL lags.
    out.idempotencyPurged = (await IdempotencyKey.deleteMany({ expiresAt: { $lte: new Date() } })).deletedCount ?? 0;
    out.outboxPurged =
      (await OutboxEvent.deleteMany({
        status: "PUBLISHED",
        publishedAt: { $lte: new Date(Date.now() - 86_400_000) },
      })).deletedCount ?? 0;
  });

  incr("worker.sweep.expired", out.expired);
  logger.info("worker.sweep.done", out);
  return out;
}
