import { Types } from "mongoose";
import { User, Session, type UserDoc } from "@/lib/db/models";
import { hashPassword, verifyPassword, sha256, randomToken } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { audit } from "./audit.service";
import { emitEvent } from "./events.service";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_COOKIE = "sid";

export interface AuthContext {
  userId: string;
  role: "USER" | "ADMIN";
  email: string;
  method: "session" | "apiKey";
  apiKeyId?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  role: string;
  status: string;
  displayName: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export function toPublicUser(u: UserDoc): PublicUser {
  return {
    id: String(u._id),
    email: u.email,
    role: u.role,
    status: u.status,
    displayName: u.displayName ?? null,
    createdAt: (u as unknown as { createdAt: Date }).createdAt,
    lastLoginAt: u.lastLoginAt ?? null,
  };
}

export async function register(
  email: string,
  password: string,
  ipHash: string,
): Promise<{ user: PublicUser; sessionToken: string }> {
  const normEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  let user: UserDoc;
  try {
    // Rely on the unique index, not a check-then-insert (Plan §8, §84).
    user = await User.create({ email: normEmail, passwordHash, role: "USER", status: "ACTIVE" });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError("CONFLICT", "An account with this email already exists");
    }
    throw err;
  }

  const sessionToken = await createSession(String(user._id), ipHash);
  await audit({ actorId: String(user._id), action: "REGISTER", resourceType: "user", resourceId: String(user._id), ipHash });
  await emitEvent("USER_REGISTERED", { userId: String(user._id) });
  logger.info("auth.registered", { userId: String(user._id) });
  return { user: toPublicUser(user), sessionToken };
}

export async function login(
  email: string,
  password: string,
  ipHash: string,
): Promise<{ user: PublicUser; sessionToken: string }> {
  const normEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normEmail });
  // Always run a hash comparison to keep timing roughly constant.
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, "$2a$12$0000000000000000000000000000000000000000000000000000a");

  if (!user || !ok) {
    await audit({ actorId: user ? String(user._id) : null, actorType: "ANON", action: "LOGIN_FAILED", ipHash });
    throw new AppError("UNAUTHORIZED", "Invalid email or password");
  }
  if (user.status !== "ACTIVE") {
    throw new AppError("FORBIDDEN", `Account is ${user.status.toLowerCase()}`);
  }

  user.lastLoginAt = new Date();
  await user.save();
  const sessionToken = await createSession(String(user._id), ipHash);
  await audit({ actorId: String(user._id), action: "LOGIN", ipHash });
  logger.info("auth.login", { userId: String(user._id) });
  return { user: toPublicUser(user), sessionToken };
}

async function createSession(userId: string, ipHash: string): Promise<string> {
  const token = randomToken(32);
  await Session.create({
    userId: new Types.ObjectId(userId),
    sessionHash: sha256(token),
    ipHash,
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function resolveSession(token: string): Promise<AuthContext | null> {
  const session = await Session.findOne({ sessionHash: sha256(token), revokedAt: null });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;

  const user = await User.findById(session.userId);
  if (!user || user.status !== "ACTIVE") return null;

  // Touch lastUsedAt at most once a minute to avoid a write per request.
  if (Date.now() - session.lastUsedAt.getTime() > 60_000) {
    void Session.updateOne({ _id: session._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { userId: String(user._id), role: user.role, email: user.email, method: "session" };
}

export async function logout(token: string): Promise<void> {
  await Session.updateOne({ sessionHash: sha256(token) }, { $set: { revokedAt: new Date() } });
}

export async function logoutAll(userId: string): Promise<void> {
  await Session.updateMany({ userId: new Types.ObjectId(userId), revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export function sessionCookieOptions(maxAgeSec = SESSION_TTL_MS / 1000) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}
