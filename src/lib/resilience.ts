import { AppError } from "./errors";
import { logger } from "./logger";

/**
 * Timeouts, retries and circuit breakers (Plan §31, §32).
 * Every external dependency call should be wrapped in at least a timeout.
 */

export function withTimeout<T>(promise: Promise<T>, ms: number, label = "op"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new AppError("DEPENDENCY_TIMEOUT", `${label} timed out after ${ms}ms`, { retryable: true }));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
  /** Return true to retry this error. Default: only AppError.retryable. */
  isRetryable?: (err: unknown) => boolean;
}

/** Exponential backoff w/ full jitter. Retries transient failures only (Plan §31). */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 100,
    maxDelayMs = 2_000,
    label = "op",
    isRetryable = (err) => err instanceof AppError && err.retryable,
  } = opts;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries || !isRetryable(err)) throw err;
      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = Math.random() * exp;
      logger.warn("retry.attempt", { label, attempt, delayMs: Math.round(delay) });
      await sleep(delay);
    }
  }
}

/**
 * In-process circuit breaker (Plan §32). State lives on the module global so it
 * is shared across requests handled by the same warm function instance.
 */
type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface Breaker {
  state: BreakerState;
  failures: number;
  openedAt: number;
}

const globalForBreakers = globalThis as unknown as { _breakers?: Map<string, Breaker> };
const breakers = globalForBreakers._breakers ?? new Map<string, Breaker>();
globalForBreakers._breakers = breakers;

export interface BreakerOptions {
  failureThreshold?: number;
  resetAfterMs?: number;
}

export async function withBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: () => T | Promise<T>,
  opts: BreakerOptions = {},
): Promise<T> {
  const { failureThreshold = 5, resetAfterMs = 15_000 } = opts;
  const b = breakers.get(name) ?? { state: "CLOSED" as BreakerState, failures: 0, openedAt: 0 };

  if (b.state === "OPEN") {
    if (Date.now() - b.openedAt >= resetAfterMs) {
      b.state = "HALF_OPEN";
    } else {
      return fallback();
    }
  }

  try {
    const result = await fn();
    b.state = "CLOSED";
    b.failures = 0;
    breakers.set(name, b);
    return result;
  } catch (err) {
    b.failures++;
    if (b.state === "HALF_OPEN" || b.failures >= failureThreshold) {
      b.state = "OPEN";
      b.openedAt = Date.now();
      logger.error("breaker.open", { name, failures: b.failures });
    }
    breakers.set(name, b);
    return fallback();
  }
}

export function breakerSnapshot(): Record<string, BreakerState> {
  const out: Record<string, BreakerState> = {};
  for (const [k, v] of breakers) out[k] = v.state;
  return out;
}
