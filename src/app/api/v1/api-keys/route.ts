import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseJson } from "@/server/http/request";
import { requireAuth } from "@/server/http/auth";
import { enforce } from "@/lib/ratelimit";
import { listApiKeys, createApiKey } from "@/server/services/apikey.service";

const CreateBody = z.object({
  name: z.string().trim().min(1).max(60),
  expiresInDays: z.number().int().min(1).max(365).optional().nullable(),
});

export const GET = route(
  async ({ req }) => {
    const auth = await requireAuth(req);
    return json({ apiKeys: await listApiKeys(auth.userId) });
  },
  { name: "apikeys.list" },
);

// POST — returns the raw key exactly once (Plan §16)
export const POST = route(
  async ({ req }) => {
    const auth = await requireAuth(req);
    if (auth.method === "apiKey") {
      // Don't let an API key mint more API keys.
      return json(
        { error: { code: "FORBIDDEN", message: "API keys cannot be created with an API key" } },
        { status: 403 },
      );
    }
    await enforce("mutation", auth.userId);
    const body = await parseJson(req, CreateBody);
    const { apiKey, rawKey } = await createApiKey(auth.userId, body.name, body.expiresInDays ?? null);
    return json(
      { apiKey, key: rawKey, warning: "Store this key now — it will not be shown again." },
      { status: 201 },
    );
  },
  { name: "apikeys.create" },
);
