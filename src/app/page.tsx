"use client";
import { useState } from "react";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/client/api";

export default function Home() {
  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [result, setResult] = useState<{ shortUrl: string; originalUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function shorten(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ url: { shortUrl: string; originalUrl: string } }>("/api/v1/urls", {
        url,
        alias: alias.trim() || undefined,
      });
      setResult(res.url);
      setUrl("");
      setAlias("");
    } catch (err) {
      const e = err as ApiError;
      setError(e.message + (e.requestId ? ` (${e.requestId})` : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <div className="container">
        <div className="hero">
          <h1>Shorten a URL</h1>
          <p>Anonymous links work instantly. Sign up to manage links, set expiry and see analytics.</p>
        </div>

        <div className="card" style={{ maxWidth: 620, margin: "0 auto" }}>
          <form onSubmit={shorten}>
            <div className="field">
              <label>Destination URL</label>
              <input
                type="url"
                required
                placeholder="https://example.com/some/long/path"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Custom alias (optional)</label>
              <input
                placeholder="my-link"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                pattern="[a-zA-Z0-9_-]{3,32}"
              />
            </div>
            <button disabled={busy}>{busy ? <span className="spin" /> : "Shorten"}</button>
          </form>

          {error && <div className="alert error" style={{ marginTop: 14 }}>{error}</div>}
          {result && (
            <div className="result">
              <div className="small muted">Short link</div>
              <a href={result.shortUrl} className="mono" target="_blank" rel="noreferrer">
                {result.shortUrl}
              </a>
              <button
                className="ghost small"
                style={{ marginLeft: 10, padding: "4px 10px" }}
                onClick={() => navigator.clipboard.writeText(result.shortUrl)}
              >
                Copy
              </button>
              <div className="small muted" style={{ marginTop: 6 }}>→ {result.originalUrl}</div>
            </div>
          )}
        </div>

        <div className="footer">
          <p className="small">
            System endpoints: <code>/health</code> · <code>/ready</code> · <code>/metrics</code>
          </p>
          <p className="small">A system-design reference implementation. Not a commercial service.</p>
        </div>
      </div>
    </>
  );
}
