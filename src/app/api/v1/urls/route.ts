import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseJson, parseQuery, clientIpHash, idempotencyKey } from "@/server/http/request";
import { authenticate, requireAuth } from "@/server/http/auth";
import { rateLimitHeaders, consume } from "@/lib/ratelimit";
import { withIdempotency } from "@/server/services/idempotency.service";
import { createUrl, listUrls, type UrlDto } from "@/server/services/url.service";
import { clampLimit } from "@/server/http/pagination";

const CreateBody = z.object({
  url: z.string().min(1).max(2048),
  alias: z.string().trim().min(3).max(32).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
});

const ListQuery = z.object({
  limit: z.string().optional(),
  cursor: z.string().optional(),
  status: z.enum(["ACTIVE", "DISABLED", "EXPIRED", "FLAGGED"]).optional(),
  search: z.string().max(120).optional(),
});

// POST /api/v1/urls — create (anonymous allowed, Plan §4)
export const POST = route(
  async ({ req }) => {
    const auth = await authenticate(req);
    const ipHash = clientIpHash(req);
    const body = await parseJson(req, CreateBody);

    const rl = auth
      ? await consume("authCreate", auth.userId)
      : await consume("anonCreate", ipHash);
    if (!rl.allowed) {
      return json(
        { error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const key = idempotencyKey(req);
    const ownerId = auth?.userId ?? `ip:${ipHash}`;

    const outcome = await withIdempotency<{ url: UrlDto }>(
      { scope: "POST /api/v1/urls", key, ownerId, requestBody: body },
      async () => {
        const url = await createUrl({
          url: body.url,
          alias: body.alias ?? null,
          expiresAt: body.expiresAt ?? null,
          title: body.title ?? null,
          visibility: auth ? body.visibility : "PUBLIC",
          userId: auth?.userId ?? null,
          createdByIpHash: ipHash,
        });
        return { statusCode: 201, body: { url } };
      },
    );

    return json(outcome.body, {
      status: outcome.statusCode,
      headers: {
        ...rateLimitHeaders(rl),
        ...(outcome.replayed ? { "Idempotent-Replayed": "true" } : {}),
      },
    });
  },
  { name: "urls.create" },
);

// GET /api/v1/urls — list own URLs (Plan §22)
export const GET = route(
  async ({ req }) => {
    const auth = await requireAuth(req);
    const q = parseQuery(req, ListQuery);
    const page = await listUrls({
      userId: auth.userId,
      limit: clampLimit(q.limit, 20, 100),
      cursor: q.cursor ?? null,
      status: q.status ?? null,
      search: q.search ?? null,
    });
    return json(page);
  },
  { name: "urls.list" },
);
