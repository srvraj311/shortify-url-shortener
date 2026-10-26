import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor, clampLimit } from "@/server/http/pagination";
import { AppError, toErrorBody } from "@/lib/errors";

describe("cursor pagination", () => {
  it("round-trips a cursor", () => {
    const c = { createdAt: "2026-01-01T00:00:00.000Z", id: "6a1b2c3d4e5f60718293a4b5" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  it("returns null for empty and throws for garbage", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(() => decodeCursor("!!!not-base64!!!")).toThrow(AppError);
  });
  it("clampLimit bounds the value", () => {
    expect(clampLimit(undefined, 20, 100)).toBe(20);
    expect(clampLimit("5", 20, 100)).toBe(5);
    expect(clampLimit("9999", 20, 100)).toBe(100);
    expect(clampLimit("-3", 20, 100)).toBe(1);
    expect(clampLimit("abc", 20, 100)).toBe(20);
  });
});

describe("error contract", () => {
  it("maps AppError code -> status and shapes the body", () => {
    const { status, body } = toErrorBody(new AppError("URL_NOT_FOUND", "gone"));
    expect(status).toBe(404);
    expect(body.error.code).toBe("URL_NOT_FOUND");
    expect(body.error.message).toBe("gone");
  });
  it("maps 410 for expired, 409 for alias taken, 429 for rate limited", () => {
    expect(toErrorBody(new AppError("URL_EXPIRED", "")).status).toBe(410);
    expect(toErrorBody(new AppError("ALIAS_TAKEN", "")).status).toBe(409);
    expect(toErrorBody(new AppError("RATE_LIMITED", "")).status).toBe(429);
  });
  it("never leaks internals for unknown errors", () => {
    const { status, body } = toErrorBody(new Error("secret stack detail"));
    expect(status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("secret stack detail");
  });
  it("RATE_LIMITED and 5xx are retryable, 4xx are not", () => {
    expect(new AppError("RATE_LIMITED", "").retryable).toBe(true);
    expect(new AppError("SERVICE_UNAVAILABLE", "").retryable).toBe(true);
    expect(new AppError("VALIDATION_ERROR", "").retryable).toBe(false);
  });
});
