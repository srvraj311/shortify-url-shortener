import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseJson } from "@/server/http/request";
import { requireRole } from "@/server/http/auth";
import { banUser } from "@/server/services/admin.service";
import { logoutAll } from "@/server/services/auth.service";

const Body = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]) });

// Ban / restrict a user (Plan §4 admin).
export const PATCH = route(
  async ({ req, params }) => {
    const admin = await requireRole(req, "ADMIN");
    const { status } = await parseJson(req, Body);
    await banUser(String(params.id), admin.userId, status);
    if (status !== "ACTIVE") await logoutAll(String(params.id));
    return json({ ok: true, status });
  },
  { name: "admin.user_status" },
);
