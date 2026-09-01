import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { requireRole } from "@/server/http/auth";
import { rateLimitActivity } from "@/server/services/admin.service";
import { RULES } from "@/lib/ratelimit";

export const GET = route(
  async ({ req }) => {
    await requireRole(req, "ADMIN");
    const activity = await rateLimitActivity();
    return json({ rules: RULES, activity });
  },
  { name: "admin.rate_limits" },
);
