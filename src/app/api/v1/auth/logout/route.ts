import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { logout, SESSION_COOKIE } from "@/server/services/auth.service";

export const POST = route(
  async ({ req }) => {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) await logout(token);
    const res = json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  },
  { name: "auth.logout" },
);
