"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/client/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/auth/login", { email, password });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <div className="container" style={{ maxWidth: 400 }}>
        <h1 style={{ marginTop: 40 }}>Sign in</h1>
        <div className="card">
          <form onSubmit={submit}>
            <div className="field">
              <label>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div className="alert error">{error}</div>}
            <button disabled={busy}>{busy ? <span className="spin" /> : "Sign in"}</button>
          </form>
        </div>
        <p className="muted small">
          No account? <Link href="/register">Create one</Link>
        </p>
      </div>
    </>
  );
}
