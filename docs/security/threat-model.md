# Security & threat model (Plan §35–§41)

## Controls in place

| Area | Control | Where |
|---|---|---|
| Password storage | bcrypt cost 12; constant-time compare on unknown user | `lib/crypto.ts`, `auth.service.ts` |
| Session | opaque 32-byte token, HttpOnly + Secure + SameSite=Lax, only sha256 stored, TTL, revocable | `auth.service.ts` |
| API keys | `usk_<prefix>_<secret>`, only sha256 stored, shown once, revocable, optional expiry, can't self-mint | `apikey.service.ts` |
| AuthZ | authenticate → check existence → check ownership/role; never trust client `userId` | `url.service.getUrlForOwner`, `http/auth.ts` |
| Input validation | zod on every body/query; 16 KB body cap | `http/request.ts` |
| URL scheme | allowlist `http`/`https`; reject `javascript:`/`data:`/`file:`; no embedded creds; 2048 char cap | `url-validation.ts` |
| SSRF | `assertNotSsrf()` resolves host, rejects private/link-local/CGNAT/metadata ranges (IPv4 + IPv6, v4-mapped) | `url-validation.ts` — ready for when metadata-fetch is added |
| Rate limiting | Redis token bucket, per-IP / per-user / per-key; strict login bucket | `ratelimit.ts` |
| Abuse | domain blocklist, suspicious-URL score → auto-FLAG, user reports, admin disable, auto-flag on repeated reports | `blocklist.ts`, `abuse.*` |
| Headers | HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy (`next.config`); CSP for HTML (`middleware.ts`) | |
| CORS | explicit allowlist via `CORS_ALLOWED_ORIGINS`; credentials only for listed origins | `middleware.ts` |
| CSRF | SameSite=Lax cookie + JSON-only content type + no form-encoded state-changing endpoints | |
| XSS | React auto-escaping; the 404/410 redirect pages escape the code param by hand | `[shortCode]/route.ts` |
| Audit | login/logout/create/update/delete/disable/key-create/key-revoke/admin actions | `audit.service.ts` |
| Secrets in logs | logger redacts keys matching `pass|secret|token|authorization|cookie|apikey|keyhash` | `logger.ts` |
| PII | raw IP never persisted — HMAC-SHA256 → 32-char `ipHash` at ingress | `crypto.piiHash` |

## Residual risks / accepted gaps

- **CSP uses `'unsafe-inline'`/`'unsafe-eval'`** for Next's bootstrap. Tighten with nonces if the UI grows.
- **Rate limiting degrades to per-instance** without Redis (ADR 0006).
- **No email verification / password reset** yet — documented in the plan as optional.
- **No account-deletion endpoint** — cascade rules are specified in [database/schema.md](../database/schema.md) but not implemented.
- **Bot detection is heuristic** (UA regex) — an "educational layer" per Plan §39, not a defence.
- **Open redirect by design** — it's a URL shortener. Mitigated by scheme allowlist, blocklist, abuse flow, `X-Robots-Tag: noindex` on redirects, and interstitials being a future option for FLAGGED-adjacent scores.

## The V0 credential leak

`legacy/config.json` committed a live Atlas URI + password to a public repo.
**Action required:** rotate that database user's password in Atlas (or delete the
user) and confirm nothing else uses it. The new app only reads `MONGODB_URI`
from env and never commits it.
