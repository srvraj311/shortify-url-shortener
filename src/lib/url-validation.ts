import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { AppError } from "./errors";
import { isFeatureEnabled } from "./config";

/**
 * Destination URL validation (Plan §35) and SSRF guard (Plan §36).
 */

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
export const MAX_URL_LENGTH = 2_048;

export interface NormalizedUrl {
  originalUrl: string;
  normalizedUrl: string;
  domain: string;
  host: string;
}

export function validateAndNormalizeUrl(raw: string): NormalizedUrl {
  const input = raw.trim();
  if (input.length === 0) throw new AppError("VALIDATION_ERROR", "URL is required");
  if (input.length > MAX_URL_LENGTH) {
    throw new AppError("PAYLOAD_TOO_LARGE", `URL exceeds ${MAX_URL_LENGTH} characters`);
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new AppError("VALIDATION_ERROR", "URL is malformed");
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    // Explicitly reject javascript:, data:, file:, etc.
    throw new AppError("UNSUPPORTED_URL", `Scheme "${parsed.protocol}" is not allowed`);
  }
  if (!parsed.hostname || parsed.hostname.length > 253) {
    throw new AppError("VALIDATION_ERROR", "URL hostname is invalid");
  }
  if (parsed.username || parsed.password) {
    throw new AppError("VALIDATION_ERROR", "URLs with embedded credentials are not allowed");
  }

  // Normalisation: lowercase host, strip default ports, drop fragment, sort query.
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }
  parsed.searchParams.sort();

  const host = parsed.hostname;
  const domain = host.replace(/^www\./, "");

  return {
    originalUrl: input,
    normalizedUrl: parsed.toString(),
    domain,
    host,
  };
}

/** Private / reserved IP ranges that a redirect target must never resolve to. */
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fe80") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("::ffff:") // IPv4-mapped — re-check the v4 part upstream
    );
  }
  return false;
}

/**
 * SSRF check for when the backend itself fetches a destination (metadata,
 * favicon, unfurl). Resolves the host and rejects private/internal targets
 * (Plan §36). Skip entirely if we never fetch — but call it before any such fetch.
 */
export async function assertNotSsrf(host: string): Promise<void> {
  if (!isFeatureEnabled("FEATURE_SSRF_GUARD")) return;

  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".internal")) {
    throw new AppError("SSRF_BLOCKED", "Destination host is not permitted");
  }

  if (isIP(host)) {
    if (isPrivateIp(host)) throw new AppError("SSRF_BLOCKED", "Destination IP is not permitted");
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new AppError("SSRF_BLOCKED", "Destination host could not be resolved");
  }
  for (const { address } of addresses) {
    const v4mapped = address.toLowerCase().startsWith("::ffff:")
      ? address.slice(7)
      : address;
    if (isPrivateIp(v4mapped)) {
      throw new AppError("SSRF_BLOCKED", "Destination resolves to a private address");
    }
  }
}

export function referrerDomain(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}
