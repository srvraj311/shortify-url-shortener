import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { getRequestId } from "@/lib/request-context";

export function json<T>(data: T, init?: { status?: number; headers?: Record<string, string> }) {
  const res = NextResponse.json(data, { status: init?.status ?? 200 });
  const rid = getRequestId();
  if (rid) res.headers.set("X-Request-Id", rid);
  for (const [k, v] of Object.entries(init?.headers ?? {})) res.headers.set(k, v);
  return res;
}

export function errorResponse(err: unknown) {
  const { body, status, headers } = toErrorBody(err);
  return json(body, { status, headers });
}

export function noContent(headers?: Record<string, string>) {
  const res = new NextResponse(null, { status: 204 });
  const rid = getRequestId();
  if (rid) res.headers.set("X-Request-Id", rid);
  for (const [k, v] of Object.entries(headers ?? {})) res.headers.set(k, v);
  return res;
}
