import { NextResponse } from "next/server";
import { mongoPing } from "@/lib/db/mongoose";
import { redisAvailable } from "@/lib/redis";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Readiness (Plan §45): can this instance serve traffic? Mongo is critical;
 * Redis is optional (the app degrades), so it's reported but not disqualifying.
 */
export async function GET() {
  const cfg = getConfig();
  const mongo = await mongoPing();
  const redis = cfg.redisConfigured ? redisAvailable() : "not-configured";
  const ready = mongo;
  return NextResponse.json(
    {
      status: ready ? "ready" : "not-ready",
      checks: { mongo, redis },
      ts: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
