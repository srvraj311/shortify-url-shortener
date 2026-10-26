"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/useAuth";

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { me, isAdmin } = useAuth();
  const is = (p: string) => (path === p ? "active" : "");

  async function logout() {
    await api.post("/api/v1/auth/logout").catch(() => {});
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="nav">
      <Link href="/" className="brand" style={{ color: "var(--text)" }}>
        🔗 Shortify
      </Link>
      {me && (
        <>
          <Link href="/dashboard" className={is("/dashboard")}>Dashboard</Link>
          <Link href="/settings/api-keys" className={is("/settings/api-keys")}>API keys</Link>
          {isAdmin && <Link href="/admin" className={is("/admin")}>Admin</Link>}
        </>
      )}
      <span className="spacer" />
      {me ? (
        <>
          <span className="muted small">{me.email}</span>
          <button className="ghost" onClick={logout}>Sign out</button>
        </>
      ) : (
        <>
          <Link href="/login" className={is("/login")}>Sign in</Link>
          <Link href="/register" className="btn">Sign up</Link>
        </>
      )}
    </nav>
  );
}
