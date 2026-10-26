import type { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { setUserId } from "@/lib/request-context";
import { sha256 } from "@/lib/crypto";
import { ApiKey, User } from "@/lib/db/models";
import { resolveSession, SESSION_COOKIE, type AuthContext } from "@/server/services/auth.service";

/**
 * Resolve the caller from either an HttpOnly session cookie (browser) or an
 * `Authorization: Bearer usk_...` API key (Plan §14, §16). Returns null when the
 * request is anonymous — callers decide whether that's allowed.
 */
export async function authenticate(req: NextRequest): Promise<AuthContext | null> {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const ctx = await resolveApiKey(bearer.slice(7).trim());
    if (ctx) setUserId(ctx.userId);
    return ctx;
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) {
    const ctx = await resolveSession(cookie);
    if (ctx) setUserId(ctx.userId);
    return ctx;
  }
  return null;
}

async function resolveApiKey(raw: string): Promise<AuthContext | null> {
  if (!raw.startsWith("usk_")) return null;
  const key = await ApiKey.findOne({ keyHash: sha256(raw), status: "ACTIVE" });
  if (!key) return null;
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;

  const user = await User.findById(key.userId);
  if (!user || user.status !== "ACTIVE") return null;

  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    void ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return {
    userId: String(user._id),
    role: user.role,
    email: user.email,
    method: "apiKey",
    apiKeyId: String(key._id),
  };
}

export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const ctx = await authenticate(req);
  if (!ctx) throw new AppError("UNAUTHORIZED", "Authentication required");
  return ctx;
}

export async function requireRole(req: NextRequest, role: "ADMIN"): Promise<AuthContext> {
  const ctx = await requireAuth(req);
  if (ctx.role !== role) throw new AppError("FORBIDDEN", "Admin access required");
  return ctx;
}
