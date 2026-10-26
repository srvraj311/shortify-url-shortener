import { UAParser } from "ua-parser-js";
import type { NextRequest } from "next/server";
import { referrerDomain } from "./url-validation";
import { piiHash } from "./crypto";

/**
 * Derive privacy-safe analytics dimensions from a redirect request (Plan §24,
 * §41). No raw IP, no full user-agent string beyond coarse device/browser/os.
 */

const BOT_RE =
  /bot|crawler|spider|crawling|facebookexternalhit|slackbot|telegrambot|whatsapp|discordbot|preview|monitor|curl|wget|python-requests|httpclient|headless/i;

export interface ClickDimensions {
  ipHash: string;
  userAgent: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  referrerDomain: string | null;
  country: string | null;
  city: string | null;
  isBot: boolean;
}

export function deriveClickDimensions(req: NextRequest): ClickDimensions {
  const ua = req.headers.get("user-agent") ?? "";
  const parsed = new UAParser(ua).getResult();
  const isBot = BOT_RE.test(ua) || !ua;

  const xff = req.headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0]!.trim() : req.headers.get("x-real-ip") || "0.0.0.0";

  // Vercel injects geo headers on the edge; forwarded through on Node runtime too.
  const country = req.headers.get("x-vercel-ip-country") || null;
  const city = safeDecode(req.headers.get("x-vercel-ip-city"));

  return {
    ipHash: piiHash(ip),
    userAgent: ua ? ua.slice(0, 180) : null,
    device: parsed.device.type || "desktop",
    browser: parsed.browser.name || null,
    os: parsed.os.name || null,
    referrerDomain: referrerDomain(req.headers.get("referer")),
    country,
    city,
    isBot,
  };
}

function safeDecode(v: string | null): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
