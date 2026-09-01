import { describe, it, expect, vi } from "vitest";
import { withTimeout, withRetry, withBreaker } from "@/lib/resilience";
import { AppError } from "@/lib/errors";

describe("withTimeout", () => {
  it("resolves fast ops", async () => {
    await expect(withTimeout(Promise.resolve(42), 100)).resolves.toBe(42);
  });
  it("rejects with DEPENDENCY_TIMEOUT on slow ops", async () => {
    const slow = new Promise((r) => setTimeout(r, 50));
    await expect(withTimeout(slow, 10, "x")).rejects.toMatchObject({ code: "DEPENDENCY_TIMEOUT" });
  });
});

describe("withRetry", () => {
  it("retries retryable errors then succeeds", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 3) throw new AppError("SERVICE_UNAVAILABLE", "x", { retryable: true });
      return "ok";
    });
    await expect(withRetry(fn, { retries: 5, baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn(async () => {
      throw new AppError("VALIDATION_ERROR", "nope");
    });
    await expect(withRetry(fn, { retries: 3, baseDelayMs: 1 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("gives up after the retry budget", async () => {
    const fn = vi.fn(async () => {
      throw new AppError("DEPENDENCY_TIMEOUT", "x", { retryable: true });
    });
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("withBreaker", () => {
  it("opens after the failure threshold and serves the fallback", async () => {
    const failing = async () => {
      throw new Error("boom");
    };
    const fallback = () => "fallback";
    const name = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(await withBreaker(name, failing, fallback, { failureThreshold: 3 })).toBe("fallback");
    }
    // now open: fallback without even calling fn
    const spy = vi.fn(failing);
    expect(await withBreaker(name, spy, fallback, { failureThreshold: 3 })).toBe("fallback");
    expect(spy).not.toHaveBeenCalled();
  });
});
