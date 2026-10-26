"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/client/api";
import { useAuth } from "@/lib/client/useAuth";

interface UrlDto {
  id: string;
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
  status: string;
  clickCount: number;
  expiresAt: string | null;
  createdAt: string;
  version: number;
}

export default function Dashboard() {
  const router = useRouter();
  const { me, loading } = useAuth();
  const [items, setItems] = useState<UrlDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reqSeq = useRef(0);

  useEffect(() => {
    if (!loading && !me) router.push("/login");
  }, [loading, me, router]);

  const load = useCallback(
    async (opts: { cursor?: string | null; reset?: boolean } = {}) => {
      const seq = ++reqSeq.current;
      const params = new URLSearchParams({ limit: "20" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (opts.cursor) params.set("cursor", opts.cursor);
      try {
        const res = await api.get<{ items: UrlDto[]; nextCursor: string | null }>(
          `/api/v1/urls?${params}`,
        );
        if (seq !== reqSeq.current) return; // stale response — drop it (Plan §51)
        setItems((prev) => (opts.reset ? res.items : [...prev, ...res.items]));
        setNextCursor(res.nextCursor);
        setError(null);
      } catch (err) {
        setError((err as ApiError).message);
      }
    },
    [search, statusFilter],
  );

  useEffect(() => {
    if (!me) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load({ reset: true }), 300);
    return () => clearTimeout(debounce.current);
  }, [me, search, statusFilter, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/urls", { url: newUrl, alias: newAlias.trim() || undefined });
      setNewUrl("");
      setNewAlias("");
      load({ reset: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(u: UrlDto) {
    const nextStatus = u.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: nextStatus } : x))); // optimistic (Plan §52)
    try {
      await api.patch(`/api/v1/urls/${u.id}`, { status: nextStatus, version: u.version });
      load({ reset: true });
    } catch (err) {
      setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: u.status } : x))); // rollback
      setError((err as ApiError).message);
    }
  }

  const totalClicks = items.reduce((a, x) => a + x.clickCount, 0);
  const activeCount = items.filter((x) => x.status === "ACTIVE").length;

  if (loading) return <><Nav /><div className="container"><p className="muted" style={{ marginTop: 40 }}>Loading…</p></div></>;

  return (
    <>
      <Nav />
      <div className="container">
        <h1 style={{ marginTop: 30 }}>Dashboard</h1>

        <div className="grid cols-4">
          <div className="stat"><div className="n">{items.length}{nextCursor ? "+" : ""}</div><div className="l">URLs loaded</div></div>
          <div className="stat"><div className="n">{activeCount}</div><div className="l">Active</div></div>
          <div className="stat"><div className="n">{totalClicks}</div><div className="l">Clicks (loaded)</div></div>
          <div className="stat"><div className="n">{items.filter((x) => x.status === "EXPIRED").length}</div><div className="l">Expired</div></div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>Create URL</h3>
          <form onSubmit={create} className="row">
            <input style={{ flex: 2, minWidth: 220 }} type="url" required placeholder="https://…" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
            <input style={{ flex: 1, minWidth: 140 }} placeholder="alias (optional)" value={newAlias} onChange={(e) => setNewAlias(e.target.value)} />
            <button disabled={busy}>{busy ? <span className="spin" /> : "Create"}</button>
          </form>
        </div>

        {error && <div className="alert error">{error}</div>}

        <div className="card">
          <div className="row" style={{ marginBottom: 12 }}>
            <input style={{ flex: 1 }} placeholder="Search short code, alias, title, destination…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select style={{ width: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option>ACTIVE</option><option>DISABLED</option><option>EXPIRED</option><option>FLAGGED</option>
            </select>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr><th>Short</th><th>Destination</th><th>Clicks</th><th>Status</th><th>Created</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td><a href={u.shortUrl} target="_blank" rel="noreferrer" className="mono">/{u.shortCode}</a></td>
                    <td className="muted" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.originalUrl}</td>
                    <td>{u.clickCount}</td>
                    <td><span className={`badge ${u.status}`}>{u.status}</span></td>
                    <td className="muted small">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <Link href={`/urls/${u.id}`} className="btn ghost small" style={{ padding: "4px 10px" }}>Details</Link>
                      {u.status !== "EXPIRED" && u.status !== "FLAGGED" && (
                        <button className="ghost small" style={{ padding: "4px 10px" }} onClick={() => toggleStatus(u)}>
                          {u.status === "ACTIVE" ? "Disable" : "Enable"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="muted">No URLs yet.</td></tr>}
              </tbody>
            </table>
          </div>

          {nextCursor && (
            <button className="ghost" style={{ marginTop: 12 }} onClick={() => load({ cursor: nextCursor })}>
              Load more
            </button>
          )}
        </div>
      </div>
    </>
  );
}
