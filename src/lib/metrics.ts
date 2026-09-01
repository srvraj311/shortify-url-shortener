import { withRedis, redisAvailable } from "./redis";

/**
 * Lightweight metrics (Plan §46). Counters + latency buckets.
 *
 * Primary sink is Redis (shared across all serverless instances). Without Redis
 * we keep a best-effort in-process snapshot so /metrics still shows *something*
 * for the instance serving that request.
 */

const LAT_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

type LocalMetrics = {
  counters: Map<string, number>;
  latency: Map<string, number[]>; // name -> bucket counts (len = buckets+1)
  startedAt: number;
};

const g = globalThis as unknown as { _metrics?: LocalMetrics };
const local: LocalMetrics =
  g._metrics ?? { counters: new Map(), latency: new Map(), startedAt: Date.now() };
g._metrics = local;

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function incr(name: string, by = 1, labels?: Record<string, string>): void {
  const key = labelled(name, labels);
  local.counters.set(key, (local.counters.get(key) ?? 0) + by);
  if (redisAvailable()) {
    void withRedis(
      async (r) => {
        const k = `metrics:counter:${dayKey()}:${key}`;
        await r.incrby(k, by);
        await r.expire(k, 3 * 86_400);
      },
      undefined,
      { label: "metrics.incr" },
    );
  }
}

export function observeLatency(name: string, ms: number): void {
  let arr = local.latency.get(name);
  if (!arr) {
    arr = new Array(LAT_BUCKETS_MS.length + 1).fill(0);
    local.latency.set(name, arr);
  }
  let idx = LAT_BUCKETS_MS.findIndex((b) => ms <= b);
  if (idx === -1) idx = LAT_BUCKETS_MS.length;
  arr[idx]++;
  if (redisAvailable()) {
    void withRedis(
      async (r) => {
        const k = `metrics:lat:${dayKey()}:${name}:${idx}`;
        await r.incr(k);
        await r.expire(k, 3 * 86_400);
      },
      undefined,
      { label: "metrics.latency" },
    );
  }
}

/** Time an async op and record its latency + success/failure counters. */
export async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const out = await fn();
    incr(`${name}.ok`);
    return out;
  } catch (err) {
    incr(`${name}.err`);
    throw err;
  } finally {
    observeLatency(name, performance.now() - start);
  }
}

function labelled(name: string, labels?: Record<string, string>) {
  if (!labels) return name;
  const suffix = Object.entries(labels)
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${name}{${suffix}}`;
}

export interface MetricsSnapshot {
  source: "redis" | "local";
  uptimeSec: number;
  counters: Record<string, number>;
  latency: Record<string, { buckets: Record<string, number>; p50: number; p95: number; p99: number }>;
}

export async function snapshot(): Promise<MetricsSnapshot> {
  if (redisAvailable()) {
    const redisSnap = await readRedisSnapshot();
    if (redisSnap) return redisSnap;
  }
  return {
    source: "local",
    uptimeSec: Math.round((Date.now() - local.startedAt) / 1000),
    counters: Object.fromEntries(local.counters),
    latency: Object.fromEntries(
      [...local.latency].map(([k, buckets]) => [k, summarise(buckets)]),
    ),
  };
}

async function readRedisSnapshot(): Promise<MetricsSnapshot | null> {
  return withRedis(
    async (r) => {
      const day = dayKey();
      const counterKeys = await scanKeys(r, `metrics:counter:${day}:*`);
      const latKeys = await scanKeys(r, `metrics:lat:${day}:*`);
      const counters: Record<string, number> = {};
      for (const k of counterKeys) {
        const v = await r.get<number>(k);
        counters[k.replace(`metrics:counter:${day}:`, "")] = Number(v ?? 0);
      }
      const latRaw: Record<string, number[]> = {};
      for (const k of latKeys) {
        const m = k.match(new RegExp(`metrics:lat:${day}:(.+):(\\d+)$`));
        if (!m) continue;
        const [, name, idxStr] = m;
        const idx = Number(idxStr);
        latRaw[name] ??= new Array(LAT_BUCKETS_MS.length + 1).fill(0);
        latRaw[name][idx] = Number((await r.get<number>(k)) ?? 0);
      }
      return {
        source: "redis" as const,
        uptimeSec: Math.round((Date.now() - local.startedAt) / 1000),
        counters,
        latency: Object.fromEntries([...Object.entries(latRaw)].map(([k, b]) => [k, summarise(b)])),
      };
    },
    null,
    { label: "metrics.snapshot", timeoutMs: 2_000 },
  );
}

async function scanKeys(r: import("@upstash/redis").Redis, pattern: string): Promise<string[]> {
  const out: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await r.scan(cursor, { match: pattern, count: 200 });
    out.push(...keys);
    cursor = next;
  } while (cursor !== "0" && out.length < 2_000);
  return out;
}

function summarise(buckets: number[]) {
  const total = buckets.reduce((a, b) => a + b, 0);
  const pct = (p: number) => {
    if (total === 0) return 0;
    const target = total * p;
    let cum = 0;
    for (let i = 0; i < buckets.length; i++) {
      cum += buckets[i];
      if (cum >= target) return LAT_BUCKETS_MS[i] ?? LAT_BUCKETS_MS[LAT_BUCKETS_MS.length - 1] * 2;
    }
    return LAT_BUCKETS_MS[LAT_BUCKETS_MS.length - 1] * 2;
  };
  const labels = [...LAT_BUCKETS_MS.map((b) => `<=${b}`), "+Inf"];
  return {
    buckets: Object.fromEntries(labels.map((l, i) => [l, buckets[i] ?? 0])),
    p50: pct(0.5),
    p95: pct(0.95),
    p99: pct(0.99),
  };
}
