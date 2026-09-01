import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { requireAuth } from "@/server/http/auth";
import { getUrlForOwner, toDto } from "@/server/services/url.service";
import { getUrlAnalytics } from "@/server/services/analytics.service";

export const GET = route(
  async ({ req, params }) => {
    const auth = await requireAuth(req);
    const doc = await getUrlForOwner(String(params.id), auth.userId, auth.role === "ADMIN");
    const summary = await getUrlAnalytics(String(doc._id));
    return json({ url: toDto(doc), analytics: summary });
  },
  { name: "urls.analytics" },
);
