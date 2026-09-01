import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseJson } from "@/server/http/request";
import { requireRole } from "@/server/http/auth";
import { Url } from "@/lib/db/models";
import { withRedis, redisAvailable } from "@/lib/redis";
import { urlKey } from "@/lib/cache";
import { AppError } from "@/lib/errors";

const Body = z.object({
  shortCode: z.string().min(1).max(64),
  iterations: z.number().int().min(10).max(500).default(100),
});

/**
 * Micro-benchmark (Plan §56, §58): resolve one short code N times against Mongo
 * directly, then N times through the Redis cache, and report the latency
 * distribution for each. Demonstrates the "MongoDB only" vs "MongoDB + Redis"
 * comparison the plan asks to measure.
 */
export const POST = route(
  async ({ req }) => {
    await requireRole(req, "ADMIN");
    const { shortCode, iterations } = await parseJson(req, Body);

    const doc = await Url.findOne({ shortCode }).select("_id");
    if (!doc) throw new AppError("URL_NOT_FOUND", "No URL with that short code to benchmark");

    const mongoOnly = await timeIt(iterations, async () => {
      await Url.findOne({ shortCode }).select("originalUrl status expiresAt userId").lean();
    });

    let cached: BenchResult | null = null;
    if (redisAvailable()) {
      // Prime the cache once.
      await withRedis((r) => r.set(urlKey(shortCode), { found: true }, { ex: 60 }), undefined);
      cached = await timeIt(iterations, async () => {
        await withRedis((r) => r.get(urlKey(shortCode)), null);
      });
    }

    return json({
      shortCode,
      iterations,
      mongoOnly,
      cached,
      speedup: cached ? Number((mongoOnly.p50 / Math.max(0.01, cached.p50)).toFixed(1)) : null,
      note: cached ? undefined : "Redis not configured — cache path not measured",
    });
  },
  { name: "admin.bench" },
);

interface BenchResult { p50: number; p95: number; p99: number; min: number; max: number; mean: number }

async function timeIt(n: number, fn: () => Promise<void>): Promise<BenchResult> {
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  const q = (p: number) => Number(samples[Math.min(samples.length - 1, Math.floor(p * samples.length))].toFixed(2));
  return {
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    min: Number(samples[0].toFixed(2)),
    max: Number(samples[samples.length - 1].toFixed(2)),
    mean: Number((samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2)),
  };
}
