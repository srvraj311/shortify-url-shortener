import { IdempotencyKey } from "@/lib/db/models";
import { sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotentOutcome<T> {
  replayed: boolean;
  statusCode: number;
  body: T;
}

/**
 * Idempotent write wrapper (Plan §27, §71, §84).
 *
 * 1st call for a key: insert IN_PROGRESS row (unique index), run `fn`, persist
 * the result, return it.
 * Concurrent / later call, same key + same body: return the stored response.
 * Same key, different body: 422-style DUPLICATE_REQUEST (key reuse is a bug).
 */
export async function withIdempotency<T>(
  args: { scope: string; key: string | null; ownerId: string; requestBody: unknown },
  fn: () => Promise<{ statusCode: number; body: T }>,
): Promise<IdempotentOutcome<T>> {
  const { scope, key, ownerId } = args;
  if (!key) {
    const out = await fn();
    return { replayed: false, statusCode: out.statusCode, body: out.body };
  }

  const requestHash = sha256(JSON.stringify(args.requestBody ?? null));
  const now = new Date();

  try {
    await IdempotencyKey.create({
      scope,
      key,
      ownerId,
      requestHash,
      status: "IN_PROGRESS",
      createdAt: now,
      expiresAt: new Date(now.getTime() + TTL_MS),
    });
  } catch (err: unknown) {
    if ((err as { code?: number }).code !== 11000) throw err;

    const existing = await IdempotencyKey.findOne({ scope, ownerId, key });
    if (!existing) throw err;
    if (existing.requestHash !== requestHash) {
      throw new AppError("DUPLICATE_REQUEST", "Idempotency-Key was already used with a different request body");
    }
    if (existing.status === "COMPLETED") {
      logger.info("idempotency.replayed", { scope, key });
      return { replayed: true, statusCode: existing.statusCode ?? 200, body: existing.response as T };
    }
    // Still IN_PROGRESS elsewhere — tell the client to retry shortly.
    throw new AppError("DUPLICATE_REQUEST", "An identical request is already being processed", {
      headers: { "Retry-After": "2" },
      retryable: true,
    });
  }

  try {
    const out = await fn();
    await IdempotencyKey.updateOne(
      { scope, ownerId, key },
      { $set: { status: "COMPLETED", statusCode: out.statusCode, response: out.body } },
    );
    return { replayed: false, statusCode: out.statusCode, body: out.body };
  } catch (err) {
    // Roll the marker back so the client can retry a transient failure.
    await IdempotencyKey.deleteOne({ scope, ownerId, key, status: "IN_PROGRESS" }).catch(() => {});
    throw err;
  }
}
