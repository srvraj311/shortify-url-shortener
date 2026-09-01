import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseJson } from "@/server/http/request";
import { requireRole } from "@/server/http/auth";
import { setUrlStatus } from "@/server/services/admin.service";

const Body = z.object({
  status: z.enum(["ACTIVE", "DISABLED", "FLAGGED"]),
  reason: z.string().max(200).optional(),
});

export const PATCH = route(
  async ({ req, params }) => {
    const admin = await requireRole(req, "ADMIN");
    const body = await parseJson(req, Body);
    await setUrlStatus(String(params.id), body.status, admin.userId, body.reason);
    return json({ ok: true, status: body.status });
  },
  { name: "admin.url_status" },
);
