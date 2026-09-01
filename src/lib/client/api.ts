"use client";

/** Thin fetch wrapper for the browser. Surfaces the API's error contract. */

export class ApiError extends Error {
  code: string;
  status: number;
  requestId?: string;
  details?: unknown;
  constructor(status: number, body: { error?: { code?: string; message?: string; requestId?: string; details?: unknown } }) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code || "UNKNOWN";
    this.requestId = body?.error?.requestId;
    this.details = body?.error?.details;
  }
}

async function request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown, h?: Record<string, string>) => request<T>("POST", p, b, h),
  patch: <T>(p: string, b?: unknown) => request<T>("PATCH", p, b),
  del: <T>(p: string) => request<T>("DELETE", p ?? "", undefined),
};

export interface Me {
  user: { id: string; email: string; role: string; status: string; displayName: string | null };
  authMethod: string;
}
