import { NextResponse, after } from "next/server";
import { route } from "@/server/http/handler";
import { clientIpHash } from "@/server/http/request";
import { consume, rateLimitHeaders } from "@/lib/ratelimit";
import { isReservedPath } from "@/lib/shortcode";
import { isFeatureEnabled } from "@/lib/config";
import { resolveForRedirect } from "@/server/services/url.service";
import { emitEvent } from "@/server/services/events.service";
import { scheduleOpportunisticDrain } from "@/server/workers/opportunistic";
import { deriveClickDimensions } from "@/lib/analytics-enrich";
import { logger } from "@/lib/logger";
import { incr } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Redirect hot path (Plan §34, §76).
 *
 *   requestId -> rate limit -> cache-aside resolve -> status gate -> 302
 *                                                              \-> async click event
 *
 * Analytics never blocks the redirect: the event is emitted in `after()` once
 * the 302 is already on the wire (Plan §23).
 */
export const GET = route(
  async ({ req, params }) => {
    const shortCode = String(params.shortCode ?? "");

    if (!shortCode || isReservedPath(shortCode) || shortCode.length > 64) {
      return notFoundHtml(shortCode);
    }

    // Redirects get a generous per-IP bucket (Plan §17).
    const rl = await consume("redirect", clientIpHash(req));
    if (!rl.allowed) {
      return new NextResponse("Too many requests", {
        status: 429,
        headers: rateLimitHeaders(rl),
      });
    }

    const { value: resolution, cacheHit } = await resolveForRedirect(shortCode);
    incr("redirect.lookup", 1, { result: cacheHit ? "hit" : "miss" });

    if (!resolution.found) {
      incr("redirect.not_found");
      return notFoundHtml(shortCode);
    }

    if (resolution.status !== "ACTIVE") {
      incr("redirect.inactive", 1, { status: resolution.status });
      return goneHtml(resolution.status);
    }
    if (resolution.expiresAt && new Date(resolution.expiresAt).getTime() <= Date.now()) {
      incr("redirect.expired");
      return goneHtml("EXPIRED");
    }

    incr("redirect.ok");

    if (isFeatureEnabled("FEATURE_ANALYTICS")) {
      const dims = deriveClickDimensions(req);
      after(async () => {
        try {
          await emitEvent("URL_CLICKED", {
            urlId: resolution.id,
            shortCode,
            userId: resolution.userId,
            ...dims,
          });
        } catch (err) {
          logger.warn("redirect.event_emit_failed", { shortCode, err });
        }
      });
      scheduleOpportunisticDrain();
    }

    const res = NextResponse.redirect(resolution.originalUrl, 302);
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("X-Robots-Tag", "noindex");
    for (const [k, v] of Object.entries(rateLimitHeaders(rl))) res.headers.set(k, v);
    return res;
  },
  { name: "redirect", chaos: true },
);

function notFoundHtml(code: string) {
  return new NextResponse(
    page("Link not found", `No short link matches <code>/${escapeHtml(code)}</code>.`),
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function goneHtml(status: string) {
  const reason =
    status === "EXPIRED"
      ? "This link has expired."
      : status === "FLAGGED"
        ? "This link was disabled for policy reasons."
        : "This link is no longer active.";
  return new NextResponse(page("Link unavailable", reason), {
    status: 410,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function page(title: string, body: string) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1.5rem;color:#1a1a1a}
h1{font-size:1.4rem}code{background:#f2f2f2;padding:.1em .35em;border-radius:4px}a{color:#3b5bdb}</style>
<h1>${title}</h1><p>${body}</p><p><a href="/">Go to homepage</a></p>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
