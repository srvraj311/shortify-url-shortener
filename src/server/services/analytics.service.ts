import { Types } from "mongoose";
import { UrlEvent, UrlDailyStats } from "@/lib/db/models";

/**
 * Analytics reads (Plan §50). Summary numbers come from raw events for recency;
 * time-series comes from the pre-aggregated read model (Plan §25) so the
 * dashboard never scans the full event collection.
 */

export interface AnalyticsSummary {
  totalClicks: number;
  clicksToday: number;
  clicks7d: number;
  uniqueVisitors7d: number;
  topDevices: { key: string; count: number }[];
  topBrowsers: { key: string; count: number }[];
  topCountries: { key: string; count: number }[];
  topReferrers: { key: string; count: number }[];
}

export async function getUrlAnalytics(urlId: string): Promise<AnalyticsSummary> {
  const id = new Types.ObjectId(urlId);
  const now = new Date();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start7d = new Date(now.getTime() - 7 * 86_400_000);

  const [totals] = await UrlEvent.aggregate<{
    totalClicks: number;
    clicksToday: number;
    clicks7d: number;
    visitors7d: string[];
    devices: string[];
    browsers: string[];
    countries: string[];
    referrers: string[];
  }>([
    { $match: { urlId: id } },
    {
      $group: {
        _id: null,
        totalClicks: { $sum: 1 },
        clicksToday: { $sum: { $cond: [{ $gte: ["$timestamp", startToday] }, 1, 0] } },
        clicks7d: { $sum: { $cond: [{ $gte: ["$timestamp", start7d] }, 1, 0] } },
        visitors7d: {
          $addToSet: { $cond: [{ $gte: ["$timestamp", start7d] }, "$ipHash", "$$REMOVE"] },
        },
        devices: { $push: { $cond: [{ $gte: ["$timestamp", start7d] }, "$device", "$$REMOVE"] } },
        browsers: { $push: { $cond: [{ $gte: ["$timestamp", start7d] }, "$browser", "$$REMOVE"] } },
        countries: { $push: { $cond: [{ $gte: ["$timestamp", start7d] }, "$country", "$$REMOVE"] } },
        referrers: { $push: { $cond: [{ $gte: ["$timestamp", start7d] }, "$referrerDomain", "$$REMOVE"] } },
      },
    },
  ]);

  return {
    totalClicks: totals?.totalClicks ?? 0,
    clicksToday: totals?.clicksToday ?? 0,
    clicks7d: totals?.clicks7d ?? 0,
    uniqueVisitors7d: totals?.visitors7d?.length ?? 0,
    topDevices: topN(totals?.devices),
    topBrowsers: topN(totals?.browsers),
    topCountries: topN(totals?.countries),
    topReferrers: topN(totals?.referrers),
  };
}

export interface DailyPoint {
  date: string;
  clicks: number;
  uniqueVisitors: number;
  botClicks: number;
}

export async function getUrlDaily(urlId: string, days = 30): Promise<DailyPoint[]> {
  const id = new Types.ObjectId(urlId);
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await UrlDailyStats.find({ urlId: id, date: { $gte: since } })
    .sort({ date: 1 })
    .select("date clicks uniqueVisitors botClicks");
  return rows.map((r) => ({
    date: r.date,
    clicks: r.clicks,
    uniqueVisitors: r.uniqueVisitors,
    botClicks: r.botClicks,
  }));
}

function topN(values: (string | null | undefined)[] | undefined, n = 5) {
  if (!values) return [];
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}
