import { withRedis, redisAvailable } from "./redis";
import { isFeatureEnabled } from "./config";
import { isChaosEnabled } from "./failure-injection";
import { incr } from "./metrics";
import { AppError } from "./errors";
import { logger } from "./logger";

/**
 * Rate limiting (Plan §17).
 *
 * Distributed token bucket in Redis via an atomic Lua script — the only correct
 * option once many serverless instances serve traffic (Plan §17 note, §61).
 * When Redis is unavailable we fall back to a per-instance in-memory bucket,
 * which is a weaker guarantee (documented) but better than nothing.
 */

export interface RateLimitRule {
  /** bucket capacity (burst) */
  capacity: number;
  /** tokens added per second */
  refillPerSec: number;
}

// Plan §17 example limits.
export const RULES = {
  anonCreate: { capacity: 10, refillPerSec: 10 / 60 },
  authCreate: { capacity: 100, refillPerSec: 100 / 60 },
  redirect: { capacity: 600, refillPerSec: 600 / 60 },
  login: { capacity: 5, refillPerSec: 5 / 300 },
  apiKey: { capacity: 240, refillPerSec: 240 / 60 },
  mutation: { capacity: 60, refillPerSec: 60 / 60 },
} satisfies Record<string, RateLimitRule>;

export type RuleName = keyof typeof RULES;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSec: number;
  retryAfterSec: number;
}

// Atomic token bucket. KEYS[1]=bucket key. ARGV: capacity, refillPerSec, now(ms), cost.
const BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
local elapsed = math.max(0, now - ts) / 1000
tokens = math.min(capacity, tokens + elapsed * refill)
local allowed = 0
if tokens >= cost then allowed = 1; tokens = tokens - cost end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil((capacity / refill) * 1000) + 1000)
local reset = math.ceil((capacity - tokens) / refill)
return { allowed, math.floor(tokens), reset }
`;

// ---- in-memory fallback ----
type LocalBucket = { tokens: number; ts: number };
const g = globalThis as unknown as { _rlBuckets?: Map<string, LocalBucket> };
const localBuckets = g._rlBuckets ?? new Map<string, LocalBucket>();
g._rlBuckets = localBuckets;

function localConsume(key: string, rule: RateLimitRule, cost: number): RateLimitResult {
  const now = Date.now();
  const b = localBuckets.get(key) ?? { tokens: rule.capacity, ts: now };
  const elapsed = Math.max(0, now - b.ts) / 1000;
  b.tokens = Math.min(rule.capacity, b.tokens + elapsed * rule.refillPerSec);
  b.ts = now;
  const allowed = b.tokens >= cost;
  if (allowed) b.tokens -= cost;
  localBuckets.set(key, b);
  const resetSec = Math.ceil((rule.capacity - b.tokens) / rule.refillPerSec);
  return {
    allowed,
    limit: rule.capacity,
    remaining: Math.floor(b.tokens),
    resetSec,
    retryAfterSec: allowed ? 0 : Math.ceil(cost / rule.refillPerSec),
  };
}

export async function consume(
  ruleName: RuleName,
  identifier: string,
  cost = 1,
): Promise<RateLimitResult> {
  const rule = RULES[ruleName];

  if (!isFeatureEnabled("FEATURE_RATE_LIMIT") || (await isChaosEnabled("rateLimiterDown"))) {
    return { allowed: true, limit: rule.capacity, remaining: rule.capacity, resetSec: 0, retryAfterSec: 0 };
  }

  const key = `rl:${ruleName}:${identifier}`;

  if (redisAvailable()) {
    const res = await withRedis<[number, number, number] | null>(
      (r) => r.eval(BUCKET_LUA, [key], [rule.capacity, rule.refillPerSec, Date.now(), cost]) as Promise<[number, number, number]>,
      null,
      { label: "ratelimit.eval", timeoutMs: 500 },
    );
    if (res) {
      const [allowed, remaining, reset] = res;
      const result: RateLimitResult = {
        allowed: allowed === 1,
        limit: rule.capacity,
        remaining,
        resetSec: reset,
        retryAfterSec: allowed === 1 ? 0 : Math.max(1, Math.ceil(cost / rule.refillPerSec)),
      };
      incr(result.allowed ? "ratelimit.allowed" : "ratelimit.blocked", 1, { rule: ruleName });
      return result;
    }
    logger.warn("ratelimit.redis_unavailable_fallback_local", { rule: ruleName });
  }

  const result = localConsume(key, rule, cost);
  incr(result.allowed ? "ratelimit.allowed" : "ratelimit.blocked", 1, { rule: ruleName, mode: "local" });
  return result;
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(Math.max(0, r.remaining)),
    "X-RateLimit-Reset": String(r.resetSec),
    ...(r.allowed ? {} : { "Retry-After": String(r.retryAfterSec) }),
  };
}

/** Throw a 429 AppError (with headers) when the bucket is empty. */
export async function enforce(ruleName: RuleName, identifier: string, cost = 1): Promise<RateLimitResult> {
  const res = await consume(ruleName, identifier, cost);
  if (!res.allowed) {
    throw new AppError("RATE_LIMITED", "Rate limit exceeded", {
      headers: rateLimitHeaders(res),
      retryable: true,
    });
  }
  return res;
}
