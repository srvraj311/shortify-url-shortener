import { route } from "@/server/http/handler";
import { noContent } from "@/server/http/respond";
import { requireAuth } from "@/server/http/auth";
import { revokeApiKey } from "@/server/services/apikey.service";

export const DELETE = route(
  async ({ req, params }) => {
    const auth = await requireAuth(req);
    await revokeApiKey(auth.userId, String(params.id));
    return noContent();
  },
  { name: "apikeys.revoke" },
);
