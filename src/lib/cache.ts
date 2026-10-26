import { withRedis, redisAvailable } from "./redis";
import { isFeatureEnabled } from "./config";
import { incr } from "./metrics";
import { logger } from "./logger";

/**
 * Cache-aside for the redirect hot path (Plan §18, §19, §20).
 *
 * - key: `url:{shortCode}`
 * - jittered TTL to avoid synchronised expiry (stampede mitigation, §19)
 * - single-flight per warm instance so N concurrent misses => 1 DB read (§19 request coalescing)
 * - negative caching for unknown codes (short TTL) to blunt scans for random codes
 */

const POSITIVE_TTL_SEC = 3_600;
const NEGATIVE_TTL_SEC = 60;
const JITTER_RATIO = 0.2;

function jitter(base: number) {
  const delta = base * JITTER_RATIO;
  return Math.round(base - delta + Math.random() * 2 * delta);
}

export function urlKey(shortCode: string) {
  return `url:${shortCode}`;
}

// Per-instance in-flight map for request coalescing.
const g = globalThis as unknown as { _cacheInflight?: Map<string, Promise<unknown>> };
const inflight = g._cacheInflight ?? new Map<string, Promise<unknown>>();
g._cacheInflight = inflight;

export interface CachedUrl {
  id: string;
  originalUrl: string;
  status: string;
  expiresAt: string | null;
  userId: string | null;
  found: boolean;
}

/**
 * Get a value through the cache. `loader` is only invoked on a miss, and only
 * once per key per instance even under concurrency.
 */
export async function cacheAside<T extends { found: boolean }>(
  key: string,
  loader: () => Promise<T>,
  opts: { positiveTtlSec?: number; negativeTtlSec?: number } = {},
): Promise<{ value: T; hit: boolean }> {
  if (!isFeatureEnabled("FEATURE_REDIS_CACHE") || !redisAvailable()) {
    return { value: await coalesced(key, loader), hit: false };
  }

  const cached = await withRedis<T | null>((r) => r.get<T>(key), null, {
    label: "cache.get",
    timeoutMs: 400,
  });
  if (cached) {
    incr("cache.hit");
    return { value: cached, hit: true };
  }
  incr("cache.miss");

  const value = await coalesced(key, loader);
  const ttl = value.found
    ? jitter(opts.positiveTtlSec ?? POSITIVE_TTL_SEC)
    : opts.negativeTtlSec ?? NEGATIVE_TTL_SEC;
  void withRedis((r) => r.set(key, value, { ex: ttl }), undefined, { label: "cache.set" });
  return { value, hit: false };
}

async function coalesced<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    incr("cache.coalesced");
    return existing;
  }
  const p = loader().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Invalidate on write (Plan §18: update Mongo -> delete Redis key). */
export async function invalidateUrl(shortCode: string): Promise<void> {
  if (!redisAvailable()) return;
  await withRedis((r) => r.del(urlKey(shortCode)), 0, { label: "cache.invalidate" });
  logger.debug("cache.invalidated", { shortCode });
}
