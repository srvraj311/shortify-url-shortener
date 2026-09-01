import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { requireAuth } from "@/server/http/auth";
import { User } from "@/lib/db/models";
import { toPublicUser } from "@/server/services/auth.service";
import { AppError } from "@/lib/errors";

export const GET = route(
  async ({ req }) => {
    const ctx = await requireAuth(req);
    const user = await User.findById(ctx.userId);
    if (!user) throw new AppError("UNAUTHORIZED", "Session is no longer valid");
    return json({ user: toPublicUser(user), authMethod: ctx.method });
  },
  { name: "auth.me" },
);
