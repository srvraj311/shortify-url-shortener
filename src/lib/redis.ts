import { Redis } from "@upstash/redis";
import { getConfig } from "./config";
import { logger } from "./logger";
import { isChaosEnabled } from "./failure-injection";
import { withTimeout } from "./resilience";

/**
 * Upstash Redis (REST) accessor. Returns null when Redis isn't configured — the
 * whole system is designed to degrade to Mongo-only in that case (Plan §33, §84
 * "What if Redis dies?").
 */

let client: Redis | null = null;
let initialised = false;

function getClient(): Redis | null {
  if (initialised) return client;
  initialised = true;
  const cfg = getConfig();
  if (!cfg.redisConfigured) {
    logger.warn("redis.not_configured", { note: "running in Mongo-only degraded mode" });
    return null;
  }
  client = new Redis({
    url: cfg.UPSTASH_REDIS_REST_URL!,
    token: cfg.UPSTASH_REDIS_REST_TOKEN!,
    // We add our own timeout wrapper; disable the SDK's auto-retry to keep the
    // hot path's latency bounded and predictable (Plan §31).
    retry: false,
  });
  return client;
}

export function redisAvailable(): boolean {
  return getClient() !== null && !isChaosEnabled("redisDown");
}

/**
 * Run a Redis op with a hard timeout and a safe fallback. Any failure (including
 * the injected "redisDown" chaos switch) resolves to `fallback` and is logged,
 * never thrown — callers treat Redis as best-effort.
 */
export async function withRedis<T>(
  op: (r: Redis) => Promise<T>,
  fallback: T,
  { timeoutMs = 800, label = "redis.op" }: { timeoutMs?: number; label?: string } = {},
): Promise<T> {
  const r = getClient();
  if (!r) return fallback;
  if (await isChaosEnabled("redisDown")) {
    logger.warn("redis.chaos_down", { label });
    return fallback;
  }
  try {
    return await withTimeout(op(r), timeoutMs, label);
  } catch (err) {
    logger.warn("redis.op_failed", { label, err });
    return fallback;
  }
}

export type { Redis };
