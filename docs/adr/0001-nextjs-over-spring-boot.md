# 0001 — Next.js on Vercel, not Spring Boot

**Date:** 2026-09-02 · **Status:** Accepted

## Context
The user asked for a Java Spring Boot backend + Angular frontend "only if Vercel
can deploy it, else Next.js". The plan is explicitly Vercel-centric: edge
middleware, API functions, scheduled jobs.

## Decision
Use Next.js 15 (App Router, TypeScript). Vercel has no JVM runtime; Spring Boot
is a long-lived server, which is fundamentally incompatible with Vercel's
request-scoped serverless model. The old Angular app is preserved under
`legacy/` for reference.

## Consequences
- One deploy unit (UI + API + cron), first-class serverless primitives.
- Route Handlers replace controllers; `src/server/{services,repositories}` keep
  the clean-architecture layering the plan wants (§7).
- Team must know React/TS rather than Angular/Java.
- If a JVM is ever required, the API boundary (`/api/v1/*`, documented in
  `docs/api`) is stable enough to reimplement behind.
