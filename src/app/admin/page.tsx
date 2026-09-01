"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/client/api";
import { useAuth } from "@/lib/client/useAuth";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function AdminPage() {
  const router = useRouter();
  const { me, loading, isAdmin } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [chaos, setChaos] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [dlq, setDlq] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!me || !isAdmin)) router.push("/");
  }, [loading, me, isAdmin, router]);

  async function refresh() {
    try {
      const [s, c, r, a, d] = await Promise.all([
        api.get<any>("/api/v1/admin/stats"),
        api.get<any>("/api/v1/admin/chaos"),
        api.get<any>("/api/v1/admin/abuse-reports?status=OPEN"),
        api.get<any>("/api/v1/admin/audit-logs?limit=25"),
        api.get<any>("/api/v1/admin/dead-letters"),
      ]);
      setStats(s); setChaos(c.chaos); setReports(r.reports); setAudit(a.logs); setDlq(d.deadLetters);
      setError(null);
    } catch (err) { setError((err as ApiError).message); }
  }
  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]);

  async function toggleChaos(key: string, value: boolean) {
    setChaos((c: any) => ({ ...c, [key]: value }));
    try { await api.post("/api/v1/admin/chaos", { [key]: value }); }
    catch (err) { setError((err as ApiError).message); refresh(); }
  }
  async function setChaosNum(key: string, value: number) {
    try { const res = await api.post<any>("/api/v1/admin/chaos", { [key]: value }); setChaos(res.chaos); }
    catch (err) { setError((err as ApiError).message); }
  }

  async function resolveReport(id: string, action: "ACTIONED" | "DISMISSED") {
    try { await api.patch(`/api/v1/admin/abuse-reports/${id}`, { action }); refresh(); }
    catch (err) { setError((err as ApiError).message); }
  }
  async function disableUrl(urlId: string) {
    try { await api.patch(`/api/v1/admin/urls/${urlId}/status`, { status: "DISABLED", reason: "admin" }); refresh(); }
    catch (err) { setError((err as ApiError).message); }
  }
  async function dlqAction(id: string, action: "retry" | "discard") {
    try { await api.post("/api/v1/admin/dead-letters", { id, action }); refresh(); }
    catch (err) { setError((err as ApiError).message); }
  }

  if (loading || !isAdmin) return <><Nav /><div className="container"><p className="muted" style={{ marginTop: 30 }}>…</p></div></>;

  const chaosFlags = ["redisDown", "mongoDown", "analyticsDown", "queueDown", "rateLimiterDown"];

  return (
    <>
      <Nav />
      <div className="container">
        <div className="row" style={{ justifyContent: "space-between", marginTop: 24 }}>
          <h1>Admin</h1>
          <button className="ghost" onClick={refresh}>Refresh</button>
        </div>
        {error && <div className="alert error">{error}</div>}

        {stats && (
          <>
            <div className="grid cols-4">
              <div className="stat"><div className="n">{stats.totals.urls}</div><div className="l">Total URLs</div></div>
              <div className="stat"><div className="n">{stats.last24h.clicks}</div><div className="l">Clicks / 24h</div></div>
              <div className="stat"><div className="n">{stats.last24h.urlsCreated}</div><div className="l">Created / 24h</div></div>
              <div className="stat"><div className="n">{stats.totals.users}</div><div className="l">Users</div></div>
              <div className="stat"><div className="n">{stats.performance.p95Ms ?? "–"}</div><div className="l">p95 ms</div></div>
              <div className="stat"><div className="n">{stats.performance.cacheHitRatio ?? "–"}</div><div className="l">Cache hit ratio</div></div>
              <div className="stat"><div className="n">{stats.performance.errorRate5xx}</div><div className="l">5xx rate</div></div>
              <div className="stat"><div className="n">{stats.queue.outboxPending}</div><div className="l">Outbox pending</div></div>
            </div>
            <div className="card">
              <h3>Dependencies</h3>
              <div className="row">
                <span className={`badge ${stats.dependencies.mongo ? "ACTIVE" : "FLAGGED"}`}>Mongo {stats.dependencies.mongo ? "up" : "down"}</span>
                <span className={`badge ${stats.dependencies.redis ? "ACTIVE" : "DISABLED"}`}>Redis {stats.dependencies.redis ? "up" : "off"}</span>
                <span className="badge DISABLED">DLQ open: {stats.queue.deadLetters}</span>
                <span className="badge OPEN">Abuse open: {stats.abuse.openReports}</span>
              </div>
              <p className="small muted" style={{ marginTop: 8 }}>Circuit breakers: {JSON.stringify(stats.dependencies.breakers)}</p>
            </div>
          </>
        )}

        <div className="card">
          <h3>Failure simulation <span className="small muted">(Plan §33 / §55)</span></h3>
          <p className="small muted">Flip a dependency off and watch redirects degrade gracefully instead of failing.</p>
          {chaos && chaosFlags.map((f) => (
            <div className="toggle" key={f}>
              <span>{f}</span>
              <input type="checkbox" style={{ width: "auto" }} checked={!!chaos[f]} onChange={(e) => toggleChaos(f, e.target.checked)} />
            </div>
          ))}
          {chaos && (
            <div className="row" style={{ marginTop: 12 }}>
              <label style={{ margin: 0 }}>Extra latency (ms)</label>
              <input type="number" style={{ width: 120 }} defaultValue={chaos.extraLatencyMs} onBlur={(e) => setChaosNum("extraLatencyMs", Number(e.target.value))} />
              <label style={{ margin: 0 }}>Error rate (0–1)</label>
              <input type="number" step="0.05" min="0" max="1" style={{ width: 120 }} defaultValue={chaos.errorRate} onBlur={(e) => setChaosNum("errorRate", Number(e.target.value))} />
            </div>
          )}
        </div>

        <div className="card">
          <h3>Open abuse reports</h3>
          <table>
            <thead><tr><th>Short</th><th>Reason</th><th>When</th><th></th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className="mono">/{r.shortCode}</td>
                  <td>{r.reason}</td>
                  <td className="muted small">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                    <button className="ghost small" style={{ padding: "3px 8px" }} onClick={() => disableUrl(r.urlId)}>Disable URL</button>
                    <button className="ghost small" style={{ padding: "3px 8px" }} onClick={() => resolveReport(r.id, "ACTIONED")}>Actioned</button>
                    <button className="ghost small" style={{ padding: "3px 8px" }} onClick={() => resolveReport(r.id, "DISMISSED")}>Dismiss</button>
                  </td>
                </tr>
              ))}
              {reports.length === 0 && <tr><td colSpan={4} className="muted">None open.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Dead-letter queue</h3>
          <table>
            <thead><tr><th>Event</th><th>Type</th><th>Attempts</th><th>Error</th><th></th></tr></thead>
            <tbody>
              {dlq.map((d) => (
                <tr key={d.id}>
                  <td className="mono small">{d.eventId.slice(0, 14)}…</td>
                  <td>{d.eventType}</td>
                  <td>{d.attempts}</td>
                  <td className="muted small" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.error}</td>
                  <td className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                    <button className="ghost small" style={{ padding: "3px 8px" }} onClick={() => dlqAction(d.id, "retry")}>Retry</button>
                    <button className="ghost small" style={{ padding: "3px 8px" }} onClick={() => dlqAction(d.id, "discard")}>Discard</button>
                  </td>
                </tr>
              ))}
              {dlq.length === 0 && <tr><td colSpan={5} className="muted">Empty.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Recent audit log</h3>
          <table>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="muted small">{new Date(a.timestamp).toLocaleTimeString()}</td>
                  <td className="mono small">{a.actorId ? a.actorId.slice(0, 8) : a.actorType}</td>
                  <td>{a.action}</td>
                  <td className="muted small">{a.resourceType}{a.resourceId ? ` ${a.resourceId.slice(0, 8)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="footer"><Link href="/admin/performance">→ Performance lab</Link></p>
      </div>
    </>
  );
}
