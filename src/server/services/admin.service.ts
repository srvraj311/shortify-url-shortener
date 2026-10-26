import { Types } from "mongoose";
import {
  Url,
  User,
  UrlEvent,
  AuditLog,
  AbuseReport,
  OutboxEvent,
  DeadLetter,
} from "@/lib/db/models";
import { AppError } from "@/lib/errors";
import { snapshot } from "@/lib/metrics";
import { breakerSnapshot } from "@/lib/resilience";
import { getChaos } from "@/lib/failure-injection";
import { mongoPing } from "@/lib/db/mongoose";
import { redisAvailable, withRedis } from "@/lib/redis";
import { invalidateUrl } from "@/lib/cache";
import { audit } from "./audit.service";

/** Admin surface (Plan §54). */

export async function systemStats() {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [
    urlCount,
    activeUrlCount,
    userCount,
    clicks24h,
    urls24h,
    openReports,
    outboxPending,
    deadLetters,
    metrics,
  ] = await Promise.all([
    Url.estimatedDocumentCount(),
    Url.countDocuments({ status: "ACTIVE" }),
    User.estimatedDocumentCount(),
    UrlEvent.countDocuments({ timestamp: { $gte: dayAgo } }),
    Url.countDocuments({ createdAt: { $gte: dayAgo } }),
    AbuseReport.countDocuments({ status: "OPEN" }),
    OutboxEvent.countDocuments({ status: "PENDING" }),
    DeadLetter.countDocuments({ status: "OPEN" }),
    snapshot(),
  ]);

  const httpLat = metrics.latency["http.redirect"] ?? metrics.latency["http.urls.create"];
  return {
    totals: { urls: urlCount, activeUrls: activeUrlCount, users: userCount },
    last24h: { clicks: clicks24h, urlsCreated: urls24h },
    queue: { outboxPending, deadLetters },
    abuse: { openReports },
    performance: {
      p95Ms: httpLat?.p95 ?? null,
      cacheHitRatio: hitRatio(metrics.counters),
      requests: sumByPrefix(metrics.counters, "http.requests"),
      errorRate5xx: errorRate(metrics.counters),
    },
    dependencies: {
      mongo: await mongoPing(),
      redis: redisAvailable(),
      breakers: breakerSnapshot(),
      chaos: await getChaos(),
    },
  };
}

function hitRatio(counters: Record<string, number>) {
  const hit = counters["cache.hit"] ?? 0;
  const miss = counters["cache.miss"] ?? 0;
  const total = hit + miss;
  return total ? Number((hit / total).toFixed(3)) : null;
}
function sumByPrefix(counters: Record<string, number>, prefix: string) {
  return Object.entries(counters)
    .filter(([k]) => k.startsWith(prefix))
    .reduce((a, [, v]) => a + v, 0);
}
function errorRate(counters: Record<string, number>) {
  const total = sumByPrefix(counters, "http.requests");
  const errs = Object.entries(counters)
    .filter(([k]) => k.startsWith("http.requests") && k.includes("5xx"))
    .reduce((a, [, v]) => a + v, 0);
  return total ? Number((errs / total).toFixed(3)) : 0;
}

export async function listAuditLogs(opts: { limit: number; action?: string | null; actorId?: string | null }) {
  const filter: Record<string, unknown> = {};
  if (opts.action) filter.action = opts.action;
  if (opts.actorId) filter.actorId = opts.actorId;
  const rows = await AuditLog.find(filter).sort({ timestamp: -1 }).limit(opts.limit);
  return rows.map((r) => ({
    id: String(r._id),
    actorId: r.actorId,
    actorType: r.actorType,
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    requestId: r.requestId,
    metadata: r.metadata,
    timestamp: r.timestamp.toISOString(),
  }));
}

/** Inspect live rate-limit buckets from Redis (Plan §54, §55). */
export async function rateLimitActivity() {
  if (!redisAvailable()) return { source: "unavailable", buckets: [] as unknown[] };
  const buckets = await withRedis(
    async (r) => {
      const found: { key: string; tokens: number; updatedAt: number }[] = [];
      let cursor = "0";
      do {
        const [next, keys] = await r.scan(cursor, { match: "rl:*", count: 100 });
        cursor = next;
        for (const key of keys.slice(0, 50)) {
          const data = await r.hgetall<{ tokens: string; ts: string }>(key);
          if (data) found.push({ key, tokens: Number(data.tokens), updatedAt: Number(data.ts) });
        }
      } while (cursor !== "0" && found.length < 100);
      return found;
    },
    [] as { key: string; tokens: number; updatedAt: number }[],
    { label: "admin.rl_scan", timeoutMs: 3_000 },
  );
  return { source: "redis", buckets };
}

export async function setUrlStatus(
  urlId: string,
  status: "ACTIVE" | "DISABLED" | "FLAGGED",
  adminId: string,
  reason?: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(urlId)) throw new AppError("URL_NOT_FOUND", "Short URL does not exist");
  const doc = await Url.findByIdAndUpdate(
    urlId,
    { $set: { status, flagReason: reason ?? null }, $inc: { version: 1 } },
    { new: true },
  );
  if (!doc) throw new AppError("URL_NOT_FOUND", "Short URL does not exist");
  await invalidateUrl(doc.shortCode);
  await audit({
    actorId: adminId,
    actorType: "ADMIN",
    action: "ADMIN_SET_URL_STATUS",
    resourceType: "url",
    resourceId: urlId,
    metadata: { status, reason },
  });
}

export async function listDeadLetters(limit: number) {
  const rows = await DeadLetter.find({ status: "OPEN" }).sort({ deadLetteredAt: -1 }).limit(limit);
  return rows.map((r) => ({
    id: String(r._id),
    eventId: r.eventId,
    eventType: r.eventType,
    error: r.error,
    attempts: r.attempts,
    deadLetteredAt: r.deadLetteredAt.toISOString(),
  }));
}

export async function banUser(userId: string, adminId: string, status: "SUSPENDED" | "BANNED" | "ACTIVE") {
  if (!Types.ObjectId.isValid(userId)) throw new AppError("NOT_FOUND", "User not found");
  const res = await User.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { status } });
  if (res.matchedCount === 0) throw new AppError("NOT_FOUND", "User not found");
  await audit({ actorId: adminId, actorType: "ADMIN", action: "ADMIN_SET_USER_STATUS", resourceType: "user", resourceId: userId, metadata: { status } });
}
