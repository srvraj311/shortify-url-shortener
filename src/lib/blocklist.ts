/**
 * Domain blocklist for abuse prevention (Plan §38). Kept intentionally small and
 * in-code — an "educational layer" per the plan, not a threat-intel feed.
 * Extend via the DOMAIN_BLOCKLIST env var (comma-separated).
 */
const BUILTIN = new Set<string>([
  "example-malware.test",
  "phishing.test",
]);

export function isDomainBlocked(domain: string): boolean {
  const d = domain.toLowerCase();
  if (BUILTIN.has(d)) return true;
  const extra = (process.env.DOMAIN_BLOCKLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return extra.some((b) => d === b || d.endsWith(`.${b}`));
}

/** Cheap heuristic suspicious-URL signals (Plan §38). Non-authoritative. */
export function suspiciousUrlScore(normalizedUrl: string): number {
  let score = 0;
  const u = normalizedUrl.toLowerCase();
  if (/\d{1,3}(\.\d{1,3}){3}/.test(u)) score += 2; // raw IP host
  if (u.length > 512) score += 1;
  if ((u.match(/%[0-9a-f]{2}/g) ?? []).length > 12) score += 2; // heavy encoding
  if (/(bit\.ly|tinyurl|t\.co|goo\.gl)\//.test(u)) score += 1; // chained shortener
  if (/(login|verify|account|secure|update).*(\.php|\.html)/.test(u)) score += 1;
  return score;
}
