import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness (Plan §45): process is up. No dependency checks. */
export function GET() {
  return NextResponse.json({ status: "ok", ts: new Date().toISOString() });
}
