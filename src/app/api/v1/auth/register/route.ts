import { z } from "zod";
import { route } from "@/server/http/handler";
import { parseJson, clientIpHash } from "@/server/http/request";
import { json } from "@/server/http/respond";
import { enforce } from "@/lib/ratelimit";
import { register, sessionCookieOptions, SESSION_COOKIE } from "@/server/services/auth.service";

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const POST = route(
  async ({ req }) => {
    const ipHash = clientIpHash(req);
    await enforce("login", ipHash); // registration shares the strict login bucket
    const { email, password } = await parseJson(req, Body);

    const { user, sessionToken } = await register(email, password, ipHash);
    const res = json({ user }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    return res;
  },
  { name: "auth.register" },
);
