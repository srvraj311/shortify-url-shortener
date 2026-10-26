# 0002 — Keep the repo flat; V0 under legacy/

**Date:** 2026-09-02 · **Status:** Accepted

## Context
Plan §6 suggests an `apps/ packages/` monorepo but also says "if the existing
repository is not a monorepo, do not migrate only for aesthetics."

## Decision
Single Next.js app at the repo root. Logical boundaries are folders, not
packages: `src/lib` (infra), `src/server` (domain), `src/app` (delivery).
V0 moved wholesale to `legacy/` (git history preserved).

## Consequences
- Zero build orchestration; Vercel auto-detects the framework.
- Shared types are just imports, not a published package.
- If a second deployable (a standalone worker service) is ever needed, promote
  to a workspace then.
