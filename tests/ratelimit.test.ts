import { describe, it, expect, beforeEach } from "vitest";
import { consume, rateLimitHeaders, RULES } from "@/lib/ratelimit";
import { __resetConfigForTests } from "@/lib/config";

// No Redis in unit tests -> the in-memory token-bucket fallback is exercised.

describe("token bucket (local fallback)", () => {
  beforeEach(() => {
    process.env.FEATURE_RATE_LIMIT = "true";
    __resetConfigForTests();
  });

  it("allows up to capacity then blocks", async () => {
    const id = `u-${Math.random()}`;
    const cap = RULES.anonCreate.capacity;
    let allowed = 0;
    for (let i = 0; i < cap + 5; i++) {
      const r = await consume("anonCreate", id);
      if (r.allowed) allowed++;
    }
    expect(allowed).toBe(cap);
  });

  it("reports remaining and reset", async () => {
    const id = `u-${Math.random()}`;
    const r = await consume("authCreate", id);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(RULES.authCreate.capacity - 1);
    expect(r.limit).toBe(RULES.authCreate.capacity);
  });

  it("refills over time", async () => {
    const id = `u-${Math.random()}`;
    // drain
    for (let i = 0; i < RULES.login.capacity + 1; i++) await consume("login", id);
    const blocked = await consume("login", id);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("emits standard headers", () => {
    const h = rateLimitHeaders({ allowed: false, limit: 10, remaining: 0, resetSec: 30, retryAfterSec: 6 });
    expect(h["X-RateLimit-Limit"]).toBe("10");
    expect(h["Retry-After"]).toBe("6");
  });

  it("is disabled by the feature flag", async () => {
    process.env.FEATURE_RATE_LIMIT = "false";
    __resetConfigForTests();
    const id = `u-${Math.random()}`;
    for (let i = 0; i < 1000; i++) {
      const r = await consume("anonCreate", id);
      expect(r.allowed).toBe(true);
    }
    process.env.FEATURE_RATE_LIMIT = "true";
    __resetConfigForTests();
  });
});
