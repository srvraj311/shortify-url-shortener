import { randomToken } from "./crypto";
import { withRedis, redisAvailable } from "./redis";
import { connectMongo } from "./db/mongoose";
import { mongoose } from "./db/mongoose";
import { logger } from "./logger";

/**
 * Best-effort distributed lock (Plan §79) for jobs that should not run
 * concurrently across instances: daily aggregation, cache rebuild, sweeps.
 *
 * NOTE (per the plan): a lock is NOT a substitute for idempotency. Workers still
 * dedupe by eventId; the lock only reduces wasted duplicate work.
 *
 * Redis: SET NX PX + token-checked release. Mongo fallback: a TTL'd unique doc.
 */

export interface Lock {
  release: () => Promise<void>;
}

const RELEASE_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end`;

export async function acquireLock(name: string, ttlMs = 60_000): Promise<Lock | null> {
  const key = `lock:${name}`;
  const token = randomToken(16);

  if (redisAvailable()) {
    const ok = await withRedis(
      (r) => r.set(key, token, { nx: true, px: ttlMs }),
      null,
      { label: "lock.acquire" },
    );
    if (ok !== "OK") return null;
    return {
      release: async () => {
        await withRedis((r) => r.eval(RELEASE_LUA, [key], [token]), 0, { label: "lock.release" });
      },
    };
  }

  // Mongo fallback
  try {
    await connectMongo();
    const coll = mongoose.connection.collection("locks");
    await coll.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
    const expiresAt = new Date(Date.now() + ttlMs);
    await coll.insertOne({ _id: name as never, token, expiresAt });
    return {
      release: async () => {
        await coll.deleteOne({ _id: name as never, token });
      },
    };
  } catch (err) {
    logger.debug("lock.mongo_contended", { name, err });
    return null;
  }
}

/** Run `fn` only if the lock is obtained; otherwise resolve to null. */
export async function withLock<T>(
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const lock = await acquireLock(name, ttlMs);
  if (!lock) {
    logger.info("lock.skipped", { name });
    return null;
  }
  try {
    return await fn();
  } finally {
    await lock.release().catch(() => {});
  }
}
