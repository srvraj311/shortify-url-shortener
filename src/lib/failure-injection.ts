import { getConfig } from "./config";

/**
 * Chaos / failure-injection switches (Plan §33, §55).
 *
 * Admins flip these from /admin/chaos to demonstrate graceful degradation:
 *   "Redis down" -> redirect falls back to Mongo, still works.
 *   "Analytics down" -> redirect still 302s, events retry via the queue.
 *
 * Stored in Redis (shared across instances) with a Mongo singleton fallback and
 * a short in-process cache so we don't hit the store on every hot-path call.
 */

export type ChaosKey =
  | "redisDown"
  | "mongoDown"
  | "analyticsDown"
  | "queueDown"
  | "rateLimiterDown";

export interface ChaosConfig {
  redisDown: boolean;
  mongoDown: boolean;
  analyticsDown: boolean;
  queueDown: boolean;
  rateLimiterDown: boolean;
  extraLatencyMs: number;
  errorRate: number;
}

const DEFAULT: ChaosConfig = {
  redisDown: false,
  mongoDown: false,
  analyticsDown: false,
  queueDown: false,
  rateLimiterDown: false,
  extraLatencyMs: 0,
  errorRate: 0,
};

const CACHE_TTL_MS = 3_000;
let cache: { value: ChaosConfig; at: number } = { value: DEFAULT, at: 0 };

const globalForChaos = globalThis as unknown as { _chaos?: typeof cache };
if (globalForChaos._chaos) cache = globalForChaos._chaos;
else globalForChaos._chaos = cache;

const REDIS_KEY = "system:chaos";

export async function getChaos(): Promise<ChaosConfig> {
  if (Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  let value = DEFAULT;
  try {
    if (getConfig().redisConfigured) {
      // Lazy import to avoid a cycle (redis.ts imports this module).
      const { Redis } = await import("@upstash/redis");
      const cfg = getConfig();
      const r = new Redis({
        url: cfg.UPSTASH_REDIS_REST_URL!,
        token: cfg.UPSTASH_REDIS_REST_TOKEN!,
        retry: false,
      });
      const raw = await r.get<Partial<ChaosConfig>>(REDIS_KEY);
      if (raw) value = { ...DEFAULT, ...raw };
    }
  } catch {
    /* keep DEFAULT */
  }
  cache = { value, at: Date.now() };
  globalForChaos._chaos = cache;
  return value;
}

export async function setChaos(patch: Partial<ChaosConfig>): Promise<ChaosConfig> {
  const current = await getChaos();
  const next = { ...current, ...patch };
  try {
    if (getConfig().redisConfigured) {
      const { Redis } = await import("@upstash/redis");
      const cfg = getConfig();
      const r = new Redis({
        url: cfg.UPSTASH_REDIS_REST_URL!,
        token: cfg.UPSTASH_REDIS_REST_TOKEN!,
        retry: false,
      });
      await r.set(REDIS_KEY, next);
    } else {
      const { connectMongo } = await import("./db/mongoose");
      const { SystemFlags } = await import("./db/models/SystemFlags");
      await connectMongo();
      await SystemFlags.updateOne(
        { _id: "global" },
        { $set: { chaos: next, updatedAt: new Date() } },
        { upsert: true },
      );
    }
  } finally {
    cache = { value: next, at: Date.now() };
    globalForChaos._chaos = cache;
  }
  return next;
}

export async function isChaosEnabled(key: ChaosKey): Promise<boolean> {
  return (await getChaos())[key] === true;
}

/** Apply injected latency + random errors. Call at the top of chaos-aware ops. */
export async function applyChaosEffects(label: string): Promise<void> {
  const c = await getChaos();
  if (c.extraLatencyMs > 0) {
    await new Promise((r) => setTimeout(r, c.extraLatencyMs));
  }
  if (c.errorRate > 0 && Math.random() < c.errorRate) {
    const { AppError } = await import("./errors");
    throw new AppError("SERVICE_UNAVAILABLE", `Injected failure at ${label}`, { retryable: true });
  }
}
