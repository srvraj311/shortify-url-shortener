import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { piiHash } from "@/lib/crypto";

const MAX_BODY_BYTES = 16 * 1024;

export async function parseJson<S extends z.ZodTypeAny>(
  req: NextRequest,
  schema: S,
): Promise<z.infer<S>> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Request body is too large");
  }
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Request validation failed", {
      details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return parsed.data;
}

export function parseQuery<S extends z.ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  const obj = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Query validation failed", {
      details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return parsed.data;
}

/** Client IP from Vercel's forwarding headers. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "0.0.0.0";
}

export function clientIpHash(req: NextRequest): string {
  return piiHash(clientIp(req));
}

export function idempotencyKey(req: NextRequest): string | null {
  const k = req.headers.get("idempotency-key");
  if (!k) return null;
  if (!/^[\w.-]{8,128}$/.test(k)) {
    throw new AppError("VALIDATION_ERROR", "Idempotency-Key must be 8–128 url-safe characters");
  }
  return k;
}
