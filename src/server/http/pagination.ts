import { AppError } from "@/lib/errors";

/**
 * Cursor pagination (Plan §22). Cursor encodes the sort tie-breaker
 * (createdAt + _id) so deep pages stay O(1) instead of O(offset).
 */

export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.createdAt === "string" && typeof parsed?.id === "string") return parsed;
    return null;
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid pagination cursor");
  }
}

export function clampLimit(raw: unknown, def = 20, max = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
