import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseQuery } from "@/server/http/request";
import { requireAuth } from "@/server/http/auth";
import { getUrlForOwner } from "@/server/services/url.service";
import { getUrlDaily } from "@/server/services/analytics.service";

const Query = z.object({ days: z.coerce.number().int().min(1).max(90).optional() });

export const GET = route(
  async ({ req, params }) => {
    const auth = await requireAuth(req);
    const doc = await getUrlForOwner(String(params.id), auth.userId, auth.role === "ADMIN");
    const { days } = parseQuery(req, Query);
    const series = await getUrlDaily(String(doc._id), days ?? 30);
    return json({ urlId: String(doc._id), days: days ?? 30, series });
  },
  { name: "urls.analytics.daily" },
);
