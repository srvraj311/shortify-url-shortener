import { randomInt } from "node:crypto";

/**
 * Short-code generation & alias rules (Plan §9, §10).
 *
 * Base62 alphabet, 7 random chars => 62^7 ≈ 3.5e12 combinations. The DB unique
 * index is the ONLY authority on availability — we generate, try to insert, and
 * retry a bounded number of times on collision. We never "check then insert".
 */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const CODE_LENGTH = 7;
export const MAX_GENERATION_ATTEMPTS = 5;

export function generateShortCode(length = CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Encode a positive integer to Base62 — used by the "sequential id" strategy discussed in the ADR. */
export function toBase62(n: number): string {
  if (n === 0) return "0";
  let out = "";
  let x = n;
  while (x > 0) {
    out = ALPHABET[x % 62] + out;
    x = Math.floor(x / 62);
  }
  return out;
}

// Plan §10 — reserved words that must never become an alias (they collide with
// real routes or would be confusing).
export const RESERVED_ALIASES = new Set([
  "api", "admin", "login", "logout", "signup", "register", "health", "ready",
  "metrics", "docs", "favicon", "robots", "sitemap", "dashboard", "settings",
  "analytics", "urls", "u", "s", "static", "_next", "assets", "public", "about",
  "terms", "privacy", "help", "support", "status", "app", "www", "null", "undefined",
]);

const ALIAS_RE = /^[a-zA-Z0-9_-]{3,32}$/;

export type AliasCheck =
  | { ok: true; value: string }
  | { ok: false; code: "ALIAS_RESERVED" | "VALIDATION_ERROR"; message: string };

export function validateAlias(input: string): AliasCheck {
  const value = input.trim();
  if (!ALIAS_RE.test(value)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Alias must be 3–32 chars: letters, numbers, hyphen, underscore",
    };
  }
  if (RESERVED_ALIASES.has(value.toLowerCase())) {
    return { ok: false, code: "ALIAS_RESERVED", message: `"${value}" is a reserved word` };
  }
  return { ok: true, value };
}

/** True if a path segment is a system route rather than a short code. */
export function isReservedPath(segment: string): boolean {
  return RESERVED_ALIASES.has(segment.toLowerCase());
}
