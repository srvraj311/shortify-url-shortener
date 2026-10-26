import { describe, it, expect } from "vitest";
import {
  validateAndNormalizeUrl,
  assertNotSsrf,
  referrerDomain,
  MAX_URL_LENGTH,
} from "@/lib/url-validation";
import { AppError } from "@/lib/errors";

describe("validateAndNormalizeUrl", () => {
  it("accepts http/https and normalises", () => {
    const r = validateAndNormalizeUrl("HTTPS://Example.com:443/a/../b?z=1&a=2#frag");
    expect(r.host).toBe("example.com");
    expect(r.domain).toBe("example.com");
    expect(r.normalizedUrl).not.toContain("#frag");
    expect(r.normalizedUrl).toContain("a=2");
  });
  it("strips www for the domain but keeps host", () => {
    const r = validateAndNormalizeUrl("https://www.example.com/x");
    expect(r.host).toBe("www.example.com");
    expect(r.domain).toBe("example.com");
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://x.com"])(
    "rejects dangerous scheme %s",
    (u) => {
      expect(() => validateAndNormalizeUrl(u)).toThrow(AppError);
    },
  );
  it("rejects malformed, empty, over-long, and creds-in-url", () => {
    expect(() => validateAndNormalizeUrl("not a url")).toThrow();
    expect(() => validateAndNormalizeUrl("")).toThrow();
    expect(() => validateAndNormalizeUrl("https://user:pw@example.com")).toThrow();
    expect(() => validateAndNormalizeUrl("https://e.com/" + "x".repeat(MAX_URL_LENGTH))).toThrow();
  });
});

describe("assertNotSsrf", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "192.168.0.1",
    "169.254.169.254", // cloud metadata
    "172.16.5.4",
    "::1",
  ])("blocks private/reserved literal IP %s", async (ip) => {
    await expect(assertNotSsrf(ip)).rejects.toThrow(AppError);
  });
  it("blocks localhost-ish hostnames", async () => {
    await expect(assertNotSsrf("localhost")).rejects.toThrow();
    await expect(assertNotSsrf("foo.internal")).rejects.toThrow();
  });
  it("allows a public IP literal", async () => {
    await expect(assertNotSsrf("1.1.1.1")).resolves.toBeUndefined();
  });
});

describe("referrerDomain", () => {
  it("extracts and strips www", () => {
    expect(referrerDomain("https://www.google.com/search?q=x")).toBe("google.com");
    expect(referrerDomain(null)).toBeNull();
    expect(referrerDomain("garbage")).toBeNull();
  });
});
