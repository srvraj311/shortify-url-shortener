import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseJson } from "@/server/http/request";
import { requireRole } from "@/server/http/auth";
import { resolveReport } from "@/server/services/abuse.service";

const Body = z.object({ action: z.enum(["ACTIONED", "DISMISSED"]) });

export const PATCH = route(
  async ({ req, params }) => {
    const admin = await requireRole(req, "ADMIN");
    const { action } = await parseJson(req, Body);
    await resolveReport(String(params.id), admin.userId, action);
    return json({ ok: true, status: action });
  },
  { name: "admin.resolve_report" },
);
