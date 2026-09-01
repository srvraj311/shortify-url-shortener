import { UrlEvent, UrlDailyStats } from "@/lib/db/models";
import { withLock } from "@/lib/lock";
import { logger } from "@/lib/logger";
import { incr } from "@/lib/metrics";

/**
 * Pre-aggregation worker (Plan §25, §77). Rolls raw url_events into per-day
 * read-model docs the dashboard queries directly. Guarded by a distributed lock
 * so concurrent cron fires don't double-count (Plan §79); still idempotent
 * because it recomputes each (urlId, date) bucket from scratch.
 */

export async function aggregateRecent(opts: { sinceMinutes?: number } = {}): Promise<{ buckets: number }> {
  const since = new Date(Date.now() - (opts.sinceMinutes ?? 90) * 60_000);

  const result = await withLock("aggregation:daily", 55_000, async () => {
    const groups = await UrlEvent.aggregate<{
      _id: { urlId: unknown; date: string };
      clicks: number;
      botClicks: number;
      uniqueVisitors: number;
      byDevice: [string, number][];
      byBrowser: [string, number][];
      byOs: [string, number][];
      byCountry: [string, number][];
      byReferrer: [string, number][];
    }>([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: {
            urlId: "$urlId",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: "UTC" } },
          },
          clicks: { $sum: 1 },
          botClicks: { $sum: { $cond: ["$isBot", 1, 0] } },
          visitors: { $addToSet: "$ipHash" },
          devices: { $push: "$device" },
          browsers: { $push: "$browser" },
          oses: { $push: "$os" },
          countries: { $push: "$country" },
          referrers: { $push: "$referrerDomain" },
        },
      },
      {
        $project: {
          clicks: 1,
          botClicks: 1,
          uniqueVisitors: { $size: "$visitors" },
          byDevice: tally("$devices"),
          byBrowser: tally("$browsers"),
          byOs: tally("$oses"),
          byCountry: tally("$countries"),
          byReferrer: tally("$referrers"),
        },
      },
    ]);

    let buckets = 0;
    for (const g of groups) {
      await UrlDailyStats.updateOne(
        { urlId: g._id.urlId, date: g._id.date },
        {
          $set: {
            clicks: g.clicks,
            botClicks: g.botClicks,
            uniqueVisitors: g.uniqueVisitors,
            byDevice: Object.fromEntries(g.byDevice ?? []),
            byBrowser: Object.fromEntries(g.byBrowser ?? []),
            byOs: Object.fromEntries(g.byOs ?? []),
            byCountry: Object.fromEntries(g.byCountry ?? []),
            byReferrer: Object.fromEntries(g.byReferrer ?? []),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
      buckets++;
    }
    incr("worker.aggregation.buckets", buckets);
    return { buckets };
  });

  if (result === null) {
    logger.info("worker.aggregation.skipped_locked");
    return { buckets: 0 };
  }
  logger.info("worker.aggregation.done", result);
  return result;
}

// Mongo trick: count non-null occurrences of each value in an array field.
function tally(arrayExpr: string) {
  return {
    $map: {
      input: {
        $filter: {
          input: { $setUnion: [arrayExpr, []] },
          as: "v",
          cond: { $ne: ["$$v", null] },
        },
      },
      as: "val",
      in: [
        "$$val",
        {
          $size: {
            $filter: { input: arrayExpr, as: "x", cond: { $eq: ["$$x", "$$val"] } },
          },
        },
      ],
    },
  };
}
