import { z } from "zod";
import { route } from "@/server/http/handler";
import { json, noContent } from "@/server/http/respond";
import { parseJson } from "@/server/http/request";
import { requireAuth } from "@/server/http/auth";
import { enforce } from "@/lib/ratelimit";
import {
  getUrlForOwner,
  updateUrl,
  deleteUrl,
  toDto,
} from "@/server/services/url.service";

const PatchBody = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  version: z.number().int().nonnegative(),
});

export const GET = route(
  async ({ req, params }) => {
    const auth = await requireAuth(req);
    const doc = await getUrlForOwner(String(params.id), auth.userId, auth.role === "ADMIN");
    return json({ url: toDto(doc) });
  },
  { name: "urls.get" },
);

// PATCH — optimistic concurrency via required `version` (Plan §42)
export const PATCH = route(
  async ({ req, params }) => {
    const auth = await requireAuth(req);
    await enforce("mutation", auth.userId);
    const body = await parseJson(req, PatchBody);
    const { version, ...patch } = body;
    const url = await updateUrl(
      String(params.id),
      { userId: auth.userId, isAdmin: auth.role === "ADMIN" },
      patch,
      version,
    );
    return json({ url });
  },
  { name: "urls.update" },
);

export const DELETE = route(
  async ({ req, params }) => {
    const auth = await requireAuth(req);
    await enforce("mutation", auth.userId);
    await deleteUrl(String(params.id), { userId: auth.userId, isAdmin: auth.role === "ADMIN" });
    return noContent();
  },
  { name: "urls.delete" },
);
