import { NextResponse } from "next/server";
import { snapshot } from "@/lib/metrics";
import { breakerSnapshot } from "@/lib/resilience";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Metrics (Plan §46). JSON by default; `?format=prometheus` emits a text
 * exposition so it can be scraped. Aggregated across instances via Redis when
 * configured, otherwise per-instance.
 */
export async function GET(req: Request) {
  const snap = await snapshot();
  const format = new URL(req.url).searchParams.get("format");

  if (format === "prometheus") {
    return new NextResponse(toProm(snap), {
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    });
  }
  return NextResponse.json({ ...snap, breakers: breakerSnapshot() });
}

function toProm(snap: Awaited<ReturnType<typeof snapshot>>) {
  const lines: string[] = [`# source ${snap.source}`, `app_uptime_seconds ${snap.uptimeSec}`];
  for (const [name, value] of Object.entries(snap.counters)) {
    lines.push(`app_counter{name="${escapeLabel(name)}"} ${value}`);
  }
  for (const [name, lat] of Object.entries(snap.latency)) {
    lines.push(`app_latency_ms{name="${escapeLabel(name)}",quantile="0.5"} ${lat.p50}`);
    lines.push(`app_latency_ms{name="${escapeLabel(name)}",quantile="0.95"} ${lat.p95}`);
    lines.push(`app_latency_ms{name="${escapeLabel(name)}",quantile="0.99"} ${lat.p99}`);
  }
  return lines.join("\n") + "\n";
}

function escapeLabel(s: string) {
  return s.replace(/["\\\n]/g, "_");
}
