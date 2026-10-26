import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { Session } from "@/lib/db/models";
import { sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/services/auth.service";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Sliding-session refresh (Plan §14). Extends the current session's expiry and
 * re-issues the cookie. Opaque-token sessions mean there's no separate refresh
 * token to rotate — we just push the expiry forward while the session is valid.
 */
export const POST = route(
  async ({ req }) => {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!token) throw new AppError("UNAUTHORIZED", "No session");

    const session = await Session.findOne({ sessionHash: sha256(token), revokedAt: null });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new AppError("UNAUTHORIZED", "Session expired, please sign in again");
    }
    session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    session.lastUsedAt = new Date();
    await session.save();

    const res = json({ ok: true, expiresAt: session.expiresAt.toISOString() });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  },
  { name: "auth.refresh" },
);
