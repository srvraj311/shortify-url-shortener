import { Types } from "mongoose";
import { ApiKey } from "@/lib/db/models";
import { generateApiKey } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { audit } from "./audit.service";

/** API key management (Plan §16). Raw key is returned exactly once, on create. */

export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  status: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

function toDto(k: {
  _id: unknown;
  name: string;
  prefix: string;
  status: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}): ApiKeyDto {
  return {
    id: String(k._id),
    name: k.name,
    prefix: k.prefix,
    status: k.status,
    scopes: k.scopes,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
  };
}

export async function listApiKeys(userId: string): Promise<ApiKeyDto[]> {
  const keys = await ApiKey.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 });
  return keys.map((k) => toDto(k as never));
}

export async function createApiKey(
  userId: string,
  name: string,
  expiresInDays?: number | null,
): Promise<{ apiKey: ApiKeyDto; rawKey: string }> {
  const count = await ApiKey.countDocuments({ userId: new Types.ObjectId(userId), status: "ACTIVE" });
  if (count >= 10) throw new AppError("FORBIDDEN", "API key limit reached (10 active keys)");

  const { raw, hash, prefix } = generateApiKey();
  const doc = await ApiKey.create({
    userId: new Types.ObjectId(userId),
    name: name.trim(),
    keyHash: hash,
    prefix,
    status: "ACTIVE",
    expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
  });
  await audit({ actorId: userId, action: "CREATE_API_KEY", resourceType: "api_key", resourceId: String(doc._id) });
  return { apiKey: toDto(doc as never), rawKey: raw };
}

export async function revokeApiKey(userId: string, keyId: string): Promise<void> {
  if (!Types.ObjectId.isValid(keyId)) throw new AppError("NOT_FOUND", "API key not found");
  const res = await ApiKey.updateOne(
    { _id: new Types.ObjectId(keyId), userId: new Types.ObjectId(userId) },
    { $set: { status: "REVOKED" } },
  );
  if (res.matchedCount === 0) throw new AppError("NOT_FOUND", "API key not found");
  await audit({ actorId: userId, action: "REVOKE_API_KEY", resourceType: "api_key", resourceId: keyId });
}
