import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseQuery } from "@/server/http/request";
import { requireRole } from "@/server/http/auth";
import { listReports } from "@/server/services/abuse.service";
import { clampLimit } from "@/server/http/pagination";

const Query = z.object({
  status: z.enum(["OPEN", "REVIEWING", "ACTIONED", "DISMISSED"]).optional(),
  limit: z.string().optional(),
});

export const GET = route(
  async ({ req }) => {
    await requireRole(req, "ADMIN");
    const q = parseQuery(req, Query);
    const reports = await listReports(q.status ?? null, clampLimit(q.limit, 50, 200));
    return json({ reports });
  },
  { name: "admin.abuse_reports" },
);
