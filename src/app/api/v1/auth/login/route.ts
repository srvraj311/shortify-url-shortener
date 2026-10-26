import { z } from "zod";
import { route } from "@/server/http/handler";
import { parseJson, clientIpHash } from "@/server/http/request";
import { json } from "@/server/http/respond";
import { enforce } from "@/lib/ratelimit";
import { login, sessionCookieOptions, SESSION_COOKIE } from "@/server/services/auth.service";

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const POST = route(
  async ({ req }) => {
    const ipHash = clientIpHash(req);
    // Strict, per-IP limit on login attempts (Plan §17).
    await enforce("login", ipHash);
    const { email, password } = await parseJson(req, Body);

    const { user, sessionToken } = await login(email, password, ipHash);
    const res = json({ user });
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    return res;
  },
  { name: "auth.login" },
);
