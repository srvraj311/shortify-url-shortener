"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/client/api";
import { useAuth } from "@/lib/client/useAuth";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function PerfLab() {
  const router = useRouter();
  const { loading, isAdmin } = useAuth();
  const [metrics, setMetrics] = useState<any>(null);
  const [shortCode, setShortCode] = useState("");
  const [bench, setBench] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !isAdmin) router.push("/"); }, [loading, isAdmin, router]);

  async function loadMetrics() {
    try { setMetrics(await api.get<any>("/metrics")); } catch (err) { setError((err as ApiError).message); }
  }
  useEffect(() => { if (isAdmin) loadMetrics(); }, [isAdmin]);

  async function runBench(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setBench(null);
    try {
      setBench(await api.post<any>("/api/v1/admin/bench", { shortCode, iterations: 100 }));
    } catch (err) { setError((err as ApiError).message); }
    finally { setBusy(false); }
  }

  if (loading || !isAdmin) return <><Nav /><div className="container"><p className="muted" style={{ marginTop: 30 }}>…</p></div></>;

  return (
    <>
      <Nav />
      <div className="container">
        <p style={{ marginTop: 20 }}><Link href="/admin">← Admin</Link></p>
        <h1>Performance lab</h1>
        <p className="muted">Measure before/after instead of guessing (Plan §56–§58). Load-test scripts live in <span className="mono">/load-tests</span>.</p>
        {error && <div className="alert error">{error}</div>}

        <div className="card">
          <h3>Cache benchmark — Mongo-only vs Redis</h3>
          <form onSubmit={runBench} className="row">
            <input style={{ flex: 1 }} required placeholder="An existing short code, e.g. Ab3xK9p" value={shortCode} onChange={(e) => setShortCode(e.target.value)} />
            <button disabled={busy}>{busy ? <span className="spin" /> : "Run 100×"}</button>
          </form>
          {bench && (
            <div className="grid cols-2" style={{ marginTop: 14 }}>
              <BenchCard title="MongoDB only" r={bench.mongoOnly} />
              {bench.cached ? <BenchCard title="Through Redis cache" r={bench.cached} /> : <div className="card"><p className="muted small">{bench.note}</p></div>}
              {bench.speedup && <p className="alert ok">Cache p50 speed-up: <strong>{bench.speedup}×</strong></p>}
            </div>
          )}
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Live metrics <span className="small muted">({metrics?.source})</span></h3>
            <button className="ghost" onClick={loadMetrics}>Refresh</button>
          </div>
          {metrics && (
            <>
              <h4 className="muted small">Latency (ms)</h4>
              <table>
                <thead><tr><th>Operation</th><th>p50</th><th>p95</th><th>p99</th></tr></thead>
                <tbody>
                  {Object.entries(metrics.latency || {}).map(([k, v]: any) => (
                    <tr key={k}><td className="mono small">{k}</td><td>{v.p50}</td><td>{v.p95}</td><td>{v.p99}</td></tr>
                  ))}
                </tbody>
              </table>
              <h4 className="muted small" style={{ marginTop: 14 }}>Counters</h4>
              <div className="grid cols-3">
                {Object.entries(metrics.counters || {}).map(([k, v]: any) => (
                  <div className="stat" key={k}><div className="n">{v}</div><div className="l">{k}</div></div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function BenchCard({ title, r }: { title: string; r: any }) {
  return (
    <div className="card">
      <h4>{title}</h4>
      <div className="row"><span className="muted">p50</span><strong>{r.p50} ms</strong></div>
      <div className="row"><span className="muted">p95</span><strong>{r.p95} ms</strong></div>
      <div className="row"><span className="muted">p99</span><strong>{r.p99} ms</strong></div>
      <div className="row"><span className="muted">mean</span><strong>{r.mean} ms</strong></div>
    </div>
  );
}
