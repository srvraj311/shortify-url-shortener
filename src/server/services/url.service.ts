import { Types, type FilterQuery } from "mongoose";
import { Url, type UrlDoc } from "@/lib/db/models";
import { AppError } from "@/lib/errors";
import { getConfig, isFeatureEnabled } from "@/lib/config";
import { logger } from "@/lib/logger";
import { incr } from "@/lib/metrics";
import {
  generateShortCode,
  validateAlias,
  MAX_GENERATION_ATTEMPTS,
} from "@/lib/shortcode";
import { validateAndNormalizeUrl } from "@/lib/url-validation";
import { isDomainBlocked, suspiciousUrlScore } from "@/lib/blocklist";
import { cacheAside, invalidateUrl, urlKey } from "@/lib/cache";
import { encodeCursor, decodeCursor, type Page } from "@/server/http/pagination";
import { emitEvent } from "./events.service";
import { audit } from "./audit.service";

export interface UrlDto {
  id: string;
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
  status: string;
  visibility: string;
  type: string;
  customAlias: string | null;
  title: string | null;
  tags: string[];
  expiresAt: string | null;
  clickCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function toDto(u: UrlDoc): UrlDto {
  const base = getConfig().PUBLIC_BASE_URL;
  const anyU = u as unknown as { createdAt: Date; updatedAt: Date };
  return {
    id: String(u._id),
    shortCode: u.shortCode,
    shortUrl: `${base}/${u.shortCode}`,
    originalUrl: u.originalUrl,
    status: u.status,
    visibility: u.visibility,
    type: u.type,
    customAlias: u.customAlias ?? null,
    title: u.title ?? null,
    tags: u.tags ?? [],
    expiresAt: u.expiresAt ? u.expiresAt.toISOString() : null,
    clickCount: u.clickCount,
    version: u.version,
    createdAt: anyU.createdAt.toISOString(),
    updatedAt: anyU.updatedAt.toISOString(),
  };
}

export interface CreateUrlInput {
  url: string;
  alias?: string | null;
  expiresAt?: string | null;
  title?: string | null;
  visibility?: "PUBLIC" | "PRIVATE";
  userId?: string | null;
  createdByIpHash?: string | null;
}

export async function createUrl(input: CreateUrlInput): Promise<UrlDto> {
  const norm = validateAndNormalizeUrl(input.url);

  if (isDomainBlocked(norm.domain)) {
    await audit({ action: "CREATE_URL_BLOCKED", resourceType: "url", metadata: { domain: norm.domain } });
    throw new AppError("FORBIDDEN", "This destination domain is not allowed");
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    const d = new Date(input.expiresAt);
    if (Number.isNaN(d.getTime())) throw new AppError("VALIDATION_ERROR", "expiresAt is not a valid date");
    if (d.getTime() <= Date.now()) throw new AppError("VALIDATION_ERROR", "expiresAt must be in the future");
    expiresAt = d;
  }

  const abuseScore = suspiciousUrlScore(norm.normalizedUrl);
  const base = {
    originalUrl: norm.originalUrl,
    normalizedUrl: norm.normalizedUrl,
    domain: norm.domain,
    userId: input.userId ? new Types.ObjectId(input.userId) : null,
    createdByIpHash: input.createdByIpHash ?? null,
    visibility: input.visibility ?? "PUBLIC",
    title: input.title ?? null,
    expiresAt,
    abuseScore,
    status: abuseScore >= 4 ? "FLAGGED" : "ACTIVE",
    flagReason: abuseScore >= 4 ? "auto:suspicious-score" : null,
  } as const;

  // --- Custom alias path: single insert, unique index resolves the race ---
  if (input.alias) {
    const check = validateAlias(input.alias);
    if (!check.ok) throw new AppError(check.code, check.message);
    try {
      const doc = await Url.create({ ...base, shortCode: check.value, customAlias: check.value, type: "ALIAS" });
      await afterCreate(doc);
      return toDto(doc);
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        throw new AppError("ALIAS_TAKEN", `Alias "${check.value}" is already taken`);
      }
      throw err;
    }
  }

  // --- Random code path: generate, try insert, retry a bounded number of times ---
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const shortCode = generateShortCode();
    try {
      const doc = await Url.create({ ...base, shortCode, type: "RANDOM" });
      await afterCreate(doc);
      incr("shortcode.generated", 1, { attempts: String(attempt) });
      return toDto(doc);
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        logger.warn("shortcode.collision", { attempt });
        continue;
      }
      throw err;
    }
  }
  incr("shortcode.exhausted");
  throw new AppError("INTERNAL_ERROR", "Could not allocate a unique short code, please retry");
}

async function afterCreate(doc: UrlDoc) {
  incr("urls.created");
  await invalidateUrl(doc.shortCode); // clear any negative-cache entry
  await emitEvent("URL_CREATED", {
    urlId: String(doc._id),
    shortCode: doc.shortCode,
    userId: doc.userId ? String(doc.userId) : null,
    domain: doc.domain,
  });
  await audit({
    actorId: doc.userId ? String(doc.userId) : null,
    action: "CREATE_URL",
    resourceType: "url",
    resourceId: String(doc._id),
    metadata: { shortCode: doc.shortCode, domain: doc.domain },
  });
}

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------

export interface ListUrlsInput {
  userId: string;
  limit: number;
  cursor?: string | null;
  status?: string | null;
  search?: string | null;
}

export async function listUrls(input: ListUrlsInput): Promise<Page<UrlDto>> {
  const filter: FilterQuery<UrlDoc> = { userId: new Types.ObjectId(input.userId) };
  if (input.status) filter.status = input.status;

  if (input.search && isFeatureEnabled("FEATURE_SEARCH")) {
    const q = input.search.trim();
    // Prefix-ish match on indexed fields (Plan §21 V1) — predictable & cheap.
    filter.$or = [
      { shortCode: new RegExp(`^${escapeRegex(q)}`, "i") },
      { customAlias: new RegExp(escapeRegex(q), "i") },
      { title: new RegExp(escapeRegex(q), "i") },
      { originalUrl: new RegExp(escapeRegex(q), "i") },
    ];
  }

  const cur = decodeCursor(input.cursor);
  if (cur) {
    filter.$and = [
      ...(filter.$and ?? []),
      {
        $or: [
          { createdAt: { $lt: new Date(cur.createdAt) } },
          { createdAt: new Date(cur.createdAt), _id: { $lt: new Types.ObjectId(cur.id) } },
        ],
      },
    ];
  }

  const docs = await Url.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(input.limit + 1)
    .exec();

  const hasMore = docs.length > input.limit;
  const items = docs.slice(0, input.limit);
  const last = items[items.length - 1];
  return {
    items: items.map(toDto),
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: (last as unknown as { createdAt: Date }).createdAt.toISOString(), id: String(last._id) })
        : null,
  };
}

export async function getUrlForOwner(id: string, ownerId: string, isAdmin: boolean): Promise<UrlDoc> {
  if (!Types.ObjectId.isValid(id)) throw new AppError("URL_NOT_FOUND", "Short URL does not exist");
  const doc = await Url.findById(id);
  if (!doc) throw new AppError("URL_NOT_FOUND", "Short URL does not exist");
  // Plan §15: existence check THEN ownership check.
  if (!isAdmin && String(doc.userId) !== ownerId) {
    throw new AppError("FORBIDDEN", "You do not own this URL");
  }
  return doc;
}

// --------------------------------------------------------------------------
// Updates — optimistic concurrency (Plan §42)
// --------------------------------------------------------------------------

export interface UpdateUrlPatch {
  status?: "ACTIVE" | "DISABLED";
  expiresAt?: string | null;
  title?: string | null;
  visibility?: "PUBLIC" | "PRIVATE";
  tags?: string[];
}

export async function updateUrl(
  id: string,
  auth: { userId: string; isAdmin: boolean },
  patch: UpdateUrlPatch,
  expectedVersion: number,
): Promise<UrlDto> {
  const current = await getUrlForOwner(id, auth.userId, auth.isAdmin);

  const set: Record<string, unknown> = {};
  if (patch.status) set.status = patch.status;
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.visibility) set.visibility = patch.visibility;
  if (patch.tags) set.tags = patch.tags.slice(0, 20);
  if (patch.expiresAt !== undefined) {
    if (patch.expiresAt === null) set.expiresAt = null;
    else {
      const d = new Date(patch.expiresAt);
      if (Number.isNaN(d.getTime())) throw new AppError("VALIDATION_ERROR", "expiresAt is invalid");
      set.expiresAt = d;
    }
  }

  const updated = await Url.findOneAndUpdate(
    { _id: current._id, version: expectedVersion },
    { $set: set, $inc: { version: 1 } },
    { new: true },
  );

  if (!updated) {
    // version mismatch => someone else updated first (Plan §42).
    throw new AppError("CONFLICT", "This URL was modified by another request. Reload and try again.", {
      details: { currentVersion: current.version },
    });
  }

  await invalidateUrl(updated.shortCode);
  await emitEvent("URL_UPDATED", { urlId: String(updated._id), shortCode: updated.shortCode, changes: Object.keys(set) });
  await audit({
    actorId: auth.userId,
    action: "UPDATE_URL",
    resourceType: "url",
    resourceId: String(updated._id),
    metadata: { changes: Object.keys(set) },
  });
  incr("urls.updated");
  return toDto(updated);
}

export async function deleteUrl(id: string, auth: { userId: string; isAdmin: boolean }): Promise<void> {
  const doc = await getUrlForOwner(id, auth.userId, auth.isAdmin);
  await Url.deleteOne({ _id: doc._id });
  await invalidateUrl(doc.shortCode);
  await emitEvent("URL_DELETED", { urlId: String(doc._id), shortCode: doc.shortCode });
  await audit({
    actorId: auth.userId,
    action: "DELETE_URL",
    resourceType: "url",
    resourceId: String(doc._id),
    metadata: { shortCode: doc.shortCode },
  });
  incr("urls.deleted");
}

// --------------------------------------------------------------------------
// Redirect resolution — hot path (Plan §18, §34)
// --------------------------------------------------------------------------

export interface RedirectResolution {
  found: boolean;
  id: string;
  originalUrl: string;
  status: string;
  expiresAt: string | null;
  userId: string | null;
}

export async function resolveForRedirect(
  shortCode: string,
): Promise<{ value: RedirectResolution; cacheHit: boolean }> {
  const { value, hit } = await cacheAside<RedirectResolution>(
    urlKey(shortCode),
    async () => {
      const doc = await Url.findOne({ shortCode }).select(
        "originalUrl status expiresAt userId shortCode",
      );
      if (!doc) {
        return { found: false, id: "", originalUrl: "", status: "", expiresAt: null, userId: null };
      }
      return {
        found: true,
        id: String(doc._id),
        originalUrl: doc.originalUrl,
        status: doc.status,
        expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null,
        userId: doc.userId ? String(doc.userId) : null,
      };
    },
  );
  return { value, cacheHit: hit };
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
