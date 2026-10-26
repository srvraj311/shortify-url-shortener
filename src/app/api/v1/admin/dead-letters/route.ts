import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseJson, parseQuery } from "@/server/http/request";
import { requireRole } from "@/server/http/auth";
import { listDeadLetters } from "@/server/services/admin.service";
import { retryDeadLetter } from "@/server/workers/outbox-worker";
import { DeadLetter } from "@/lib/db/models";
import { audit } from "@/server/services/audit.service";
import { clampLimit } from "@/server/http/pagination";
import { AppError } from "@/lib/errors";

export const GET = route(
  async ({ req }) => {
    await requireRole(req, "ADMIN");
    const { limit } = parseQuery(req, z.object({ limit: z.string().optional() }));
    return json({ deadLetters: await listDeadLetters(clampLimit(limit, 50, 200)) });
  },
  { name: "admin.dlq.list" },
);

const ActionBody = z.object({ id: z.string(), action: z.enum(["retry", "discard"]) });

// Plan §29: inspect / retry / discard.
export const POST = route(
  async ({ req }) => {
    const admin = await requireRole(req, "ADMIN");
    const { id, action } = await parseJson(req, ActionBody);
    if (action === "retry") {
      const ok = await retryDeadLetter(id);
      if (!ok) throw new AppError("NOT_FOUND", "Dead letter not found or already handled");
    } else {
      await DeadLetter.updateOne({ _id: id }, { $set: { status: "DISCARDED" } });
    }
    await audit({ actorId: admin.userId, actorType: "ADMIN", action: `DLQ_${action.toUpperCase()}`, resourceId: id });
    return json({ ok: true, action });
  },
  { name: "admin.dlq.action" },
);
