"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/client/api";

interface UrlDto {
  id: string; shortCode: string; shortUrl: string; originalUrl: string;
  status: string; clickCount: number; expiresAt: string | null; createdAt: string; version: number;
}
interface Analytics {
  totalClicks: number; clicksToday: number; clicks7d: number; uniqueVisitors7d: number;
  topDevices: { key: string; count: number }[]; topBrowsers: { key: string; count: number }[];
  topCountries: { key: string; count: number }[]; topReferrers: { key: string; count: number }[];
}

export default function UrlDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [url, setUrl] = useState<UrlDto | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [daily, setDaily] = useState<{ date: string; clicks: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      const a = await api.get<{ url: UrlDto; analytics: Analytics }>(`/api/v1/urls/${id}/analytics`);
      setUrl(a.url);
      setAnalytics(a.analytics);
      const d = await api.get<{ series: { date: string; clicks: number }[] }>(`/api/v1/urls/${id}/analytics/daily?days=30`);
      setDaily(d.series);
    } catch (err) {
      setError((err as ApiError).message);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function setExpiry(days: number | null) {
    if (!url) return;
    try {
      const res = await api.patch<{ url: UrlDto }>(`/api/v1/urls/${id}`, {
        version: url.version,
        expiresAt: days === null ? null : new Date(Date.now() + days * 86400000).toISOString(),
      });
      setUrl(res.url);
      setMsg("Saved");
    } catch (err) { setError((err as ApiError).message); }
  }

  async function remove() {
    if (!confirm("Delete this URL permanently?")) return;
    try { await api.del(`/api/v1/urls/${id}`); location.href = "/dashboard"; }
    catch (err) { setError((err as ApiError).message); }
  }

  if (error) return <><Nav /><div className="container"><div className="alert error" style={{ marginTop: 30 }}>{error}</div><Link href="/dashboard">← Back</Link></div></>;
  if (!url || !analytics) return <><Nav /><div className="container"><p className="muted" style={{ marginTop: 30 }}>Loading…</p></div></>;

  const maxClicks = Math.max(1, ...daily.map((d) => d.clicks));

  return (
    <>
      <Nav />
      <div className="container">
        <p style={{ marginTop: 20 }}><Link href="/dashboard">← Dashboard</Link></p>
        <h1><span className="mono">/{url.shortCode}</span> <span className={`badge ${url.status}`}>{url.status}</span></h1>
        <p className="muted" style={{ wordBreak: "break-all" }}>→ {url.originalUrl}</p>
        {msg && <div className="alert ok">{msg}</div>}

        <div className="grid cols-2">
          <div className="card">
            <h3>Share</h3>
            <p className="mono">{url.shortUrl}
              <button className="ghost small" style={{ marginLeft: 8, padding: "3px 8px" }} onClick={() => navigator.clipboard.writeText(url.shortUrl)}>Copy</button>
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="QR code" width={180} height={180} style={{ background: "#fff", borderRadius: 8, padding: 6 }} src={`/api/v1/urls/${id}/qr`} />
          </div>
          <div className="card">
            <h3>Settings</h3>
            <p className="small muted">Created {new Date(url.createdAt).toLocaleString()}</p>
            <p className="small muted">Expires: {url.expiresAt ? new Date(url.expiresAt).toLocaleString() : "never"}</p>
            <div className="row">
              <button className="ghost" onClick={() => setExpiry(7)}>Expire in 7d</button>
              <button className="ghost" onClick={() => setExpiry(30)}>Expire in 30d</button>
              <button className="ghost" onClick={() => setExpiry(null)}>Never expire</button>
            </div>
            <button className="danger" style={{ marginTop: 12 }} onClick={remove}>Delete URL</button>
          </div>
        </div>

        <div className="grid cols-4">
          <div className="stat"><div className="n">{analytics.totalClicks}</div><div className="l">Total clicks</div></div>
          <div className="stat"><div className="n">{analytics.clicksToday}</div><div className="l">Today</div></div>
          <div className="stat"><div className="n">{analytics.clicks7d}</div><div className="l">Last 7 days</div></div>
          <div className="stat"><div className="n">{analytics.uniqueVisitors7d}</div><div className="l">Unique / 7d</div></div>
        </div>

        <div className="card">
          <h3>Clicks over time (30d)</h3>
          <p className="small muted">From the pre-aggregated read model. Recomputed by the aggregation worker.</p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
            {daily.length === 0 && <span className="muted small">No aggregated data yet.</span>}
            {daily.map((d) => (
              <div key={d.date} title={`${d.date}: ${d.clicks}`}
                style={{ flex: 1, background: "var(--accent)", height: `${(d.clicks / maxClicks) * 100}%`, minHeight: 2, borderRadius: 2 }} />
            ))}
          </div>
        </div>

        <div className="grid cols-2">
          {([["Devices", analytics.topDevices], ["Browsers", analytics.topBrowsers], ["Countries", analytics.topCountries], ["Referrers", analytics.topReferrers]] as const).map(
            ([label, rows]) => (
              <div className="card" key={label}>
                <h3>{label}</h3>
                {rows.length === 0 && <p className="muted small">No data.</p>}
                {rows.map((r) => (
                  <div key={r.key} className="row" style={{ justifyContent: "space-between" }}>
                    <span>{r.key}</span><span className="muted">{r.count}</span>
                  </div>
                ))}
              </div>
            ),
          )}
        </div>
      </div>
    </>
  );
}
