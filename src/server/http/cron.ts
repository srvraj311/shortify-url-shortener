import type { NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { safeEqual } from "@/lib/crypto";
import { AppError } from "@/lib/errors";

/**
 * Guard internal cron / worker endpoints. Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>`; we also accept the same secret via
 * `x-cron-secret` for manual `curl` runs.
 */
export function assertCron(req: NextRequest): void {
  const { CRON_SECRET } = getConfig();
  if (!CRON_SECRET) {
    throw new AppError("SERVICE_UNAVAILABLE", "CRON_SECRET is not configured");
  }
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const header = req.headers.get("x-cron-secret");
  const provided = bearer || header || "";
  if (!safeEqual(provided, CRON_SECRET)) {
    throw new AppError("UNAUTHORIZED", "Invalid cron secret");
  }
}
