import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { getConfig } from "./config";

/** Password hashing (Plan §14). bcrypt cost 12 — pure-JS, serverless-safe. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** SHA-256 hex — used for opaque tokens, API keys, session secrets. */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Keyed hash for PII we must not store in the clear (IP addresses, Plan §41). */
export function piiHash(input: string): string {
  return createHmac("sha256", getConfig().AUTH_SECRET).update(input).digest("hex").slice(0, 32);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time string compare for secret comparison (cron secret, etc). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * API key format: `usk_<prefix8>_<secret>`. Stored as sha256(full key).
 * Returns the raw key (shown once) + what to persist.
 */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const prefix = randomBytes(4).toString("hex"); // 8 hex chars
  const secret = randomBytes(24).toString("base64url");
  const raw = `usk_${prefix}_${secret}`;
  return { raw, hash: sha256(raw), prefix: `usk_${prefix}` };
}
