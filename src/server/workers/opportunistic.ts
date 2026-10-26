import { after } from "next/server";
import { drainOutboxOnce } from "./outbox-worker";
import { logger } from "@/lib/logger";

/**
 * Opportunistic outbox draining for the Vercel Hobby plan.
 *
 * Hobby cron jobs only fire once per day (Plan §63 / platform limit), which is
 * far too slow for "near real-time" analytics. So instead of relying on a
 * per-minute cron, hot requests pull a small batch off the outbox in `after()`
 * — after their own response is already sent, so latency is unaffected. A
 * per-instance time gate keeps this from stampeding the DB.
 *
 * The daily cron (/api/internal/cron) remains the guaranteed backstop that also
 * runs aggregation + the maintenance sweep.
 */

const MIN_INTERVAL_MS = 15_000;
const g = globalThis as unknown as { _lastDrainAt?: number };

export function scheduleOpportunisticDrain(batch = 25): void {
  const now = Date.now();
  if (g._lastDrainAt && now - g._lastDrainAt < MIN_INTERVAL_MS) return;
  g._lastDrainAt = now;

  after(async () => {
    try {
      await drainOutboxOnce({ max: batch });
    } catch (err) {
      logger.warn("opportunistic_drain.failed", { err });
    }
  });
}
