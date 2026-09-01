"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/client/api";
import { useAuth } from "@/lib/client/useAuth";

interface Key {
  id: string; name: string; prefix: string; status: string;
  createdAt: string; lastUsedAt: string | null; expiresAt: string | null;
}

export default function ApiKeysPage() {
  const router = useRouter();
  const { me, loading } = useAuth();
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!loading && !me) router.push("/login"); }, [loading, me, router]);
  useEffect(() => { if (me) load(); }, [me]);

  async function load() {
    try { setKeys((await api.get<{ apiKeys: Key[] }>("/api/v1/api-keys")).apiKeys); }
    catch (err) { setError((err as ApiError).message); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post<{ key: string }>("/api/v1/api-keys", { name });
      setRawKey(res.key);
      setName("");
      load();
    } catch (err) { setError((err as ApiError).message); }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Requests using it will start failing.")) return;
    try { await api.del(`/api/v1/api-keys/${id}`); load(); }
    catch (err) { setError((err as ApiError).message); }
  }

  return (
    <>
      <Nav />
      <div className="container" style={{ maxWidth: 720 }}>
        <h1 style={{ marginTop: 30 }}>API keys</h1>
        <p className="muted">Use a key as <span className="mono">Authorization: Bearer usk_…</span> to call the API without a browser session.</p>

        {error && <div className="alert error">{error}</div>}
        {rawKey && (
          <div className="alert warn">
            <strong>Copy this key now — it will not be shown again:</strong>
            <div className="mono" style={{ marginTop: 6, wordBreak: "break-all" }}>{rawKey}</div>
          </div>
        )}

        <div className="card">
          <form onSubmit={create} className="row">
            <input style={{ flex: 1 }} required placeholder="Key name (e.g. ci-pipeline)" value={name} onChange={(e) => setName(e.target.value)} />
            <button>Create key</button>
          </form>
        </div>

        <div className="card">
          <table>
            <thead><tr><th>Name</th><th>Prefix</th><th>Status</th><th>Last used</th><th></th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td className="mono small">{k.prefix}…</td>
                  <td><span className={`badge ${k.status === "ACTIVE" ? "ACTIVE" : "DISABLED"}`}>{k.status}</span></td>
                  <td className="muted small">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "never"}</td>
                  <td style={{ textAlign: "right" }}>
                    {k.status === "ACTIVE" && <button className="ghost small" style={{ padding: "4px 10px" }} onClick={() => revoke(k.id)}>Revoke</button>}
                  </td>
                </tr>
              ))}
              {keys.length === 0 && <tr><td colSpan={5} className="muted">No keys.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
