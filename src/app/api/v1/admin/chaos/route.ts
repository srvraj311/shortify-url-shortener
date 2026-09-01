import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseJson } from "@/server/http/request";
import { requireRole } from "@/server/http/auth";
import { getChaos, setChaos } from "@/lib/failure-injection";
import { audit } from "@/server/services/audit.service";

const Body = z.object({
  redisDown: z.boolean().optional(),
  mongoDown: z.boolean().optional(),
  analyticsDown: z.boolean().optional(),
  queueDown: z.boolean().optional(),
  rateLimiterDown: z.boolean().optional(),
  extraLatencyMs: z.number().int().min(0).max(10_000).optional(),
  errorRate: z.number().min(0).max(1).optional(),
});

// Developer/admin failure simulator (Plan §33, §55).
export const GET = route(
  async ({ req }) => {
    await requireRole(req, "ADMIN");
    return json({ chaos: await getChaos() });
  },
  { name: "admin.chaos.get" },
);

export const POST = route(
  async ({ req }) => {
    const admin = await requireRole(req, "ADMIN");
    const patch = await parseJson(req, Body);
    const next = await setChaos(patch);
    await audit({
      actorId: admin.userId,
      actorType: "ADMIN",
      action: "CHAOS_UPDATE",
      resourceType: "system",
      metadata: patch,
    });
    return json({ chaos: next });
  },
  { name: "admin.chaos.set" },
);
