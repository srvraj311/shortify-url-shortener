import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware (Plan §34, §37, §44).
 * - assigns X-Request-Id early so it flows through every downstream log
 * - CORS preflight handling for the JSON API
 * - Content-Security-Policy for HTML responses
 */

const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function newId() {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function middleware(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? newId();
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const origin = req.headers.get("origin");

  // --- CORS preflight ---
  if (isApi && req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    applyCors(res, origin);
    res.headers.set("X-Request-Id", requestId);
    return res;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("X-Request-Id", requestId);

  if (isApi) {
    applyCors(res, origin);
  } else {
    // CSP for the app UI (Plan §37). 'unsafe-inline' kept for Next's inline
    // bootstrap; tighten with nonces if the app grows.
    res.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    );
  }
  return res;
}

function applyCors(res: NextResponse, origin: string | null) {
  const allow =
    origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*"))
      ? origin
      : ALLOWED_ORIGINS[0] ?? "";
  if (allow) {
    res.headers.set("Access-Control-Allow-Origin", allow);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Idempotency-Key, X-Request-Id",
  );
  res.headers.set("Access-Control-Expose-Headers", "X-Request-Id, X-RateLimit-Remaining, Retry-After");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
