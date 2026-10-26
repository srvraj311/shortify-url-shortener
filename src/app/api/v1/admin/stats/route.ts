import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { requireRole } from "@/server/http/auth";
import { systemStats } from "@/server/services/admin.service";

export const GET = route(
  async ({ req }) => {
    await requireRole(req, "ADMIN");
    return json(await systemStats());
  },
  { name: "admin.stats" },
);
