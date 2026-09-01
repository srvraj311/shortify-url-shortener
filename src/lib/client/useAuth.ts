"use client";
import { useEffect, useState } from "react";
import { api, type Me } from "./api";

export function useAuth() {
  const [me, setMe] = useState<Me["user"] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Me>("/api/v1/auth/me")
      .then((r) => setMe(r.user))
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  return { me, loading, isAdmin: me?.role === "ADMIN" };
}
