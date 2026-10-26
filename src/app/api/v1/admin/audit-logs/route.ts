import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseQuery } from "@/server/http/request";
import { requireRole } from "@/server/http/auth";
import { listAuditLogs } from "@/server/services/admin.service";
import { clampLimit } from "@/server/http/pagination";

const Query = z.object({
  limit: z.string().optional(),
  action: z.string().max(60).optional(),
  actorId: z.string().max(60).optional(),
});

export const GET = route(
  async ({ req }) => {
    await requireRole(req, "ADMIN");
    const q = parseQuery(req, Query);
    const logs = await listAuditLogs({
      limit: clampLimit(q.limit, 50, 200),
      action: q.action ?? null,
      actorId: q.actorId ?? null,
    });
    return json({ logs });
  },
  { name: "admin.audit_logs" },
);
