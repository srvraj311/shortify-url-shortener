import { describe, it, expect } from "vitest";
import {
  generateShortCode,
  toBase62,
  validateAlias,
  isReservedPath,
  RESERVED_ALIASES,
  CODE_LENGTH,
} from "@/lib/shortcode";

describe("generateShortCode", () => {
  it("produces Base62 strings of the configured length", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateShortCode();
      expect(c).toHaveLength(CODE_LENGTH);
      expect(c).toMatch(/^[0-9a-zA-Z]+$/);
    }
  });
  it("has high entropy (no dupes across a small sample)", () => {
    const set = new Set(Array.from({ length: 5000 }, () => generateShortCode()));
    expect(set.size).toBe(5000);
  });
});

describe("toBase62", () => {
  it.each([
    [0, "0"],
    [61, "Z"],
    [62, "10"],
    [3843, "ZZ"],
  ])("encodes %i -> %s", (n, expected) => {
    expect(toBase62(n)).toBe(expected);
  });
});

describe("validateAlias", () => {
  it("accepts 3–32 char url-safe aliases", () => {
    expect(validateAlias("my-link_1")).toEqual({ ok: true, value: "my-link_1" });
  });
  it("rejects too short / too long / bad chars", () => {
    expect(validateAlias("ab").ok).toBe(false);
    expect(validateAlias("a".repeat(33)).ok).toBe(false);
    expect(validateAlias("has space").ok).toBe(false);
    expect(validateAlias("emoji😀x").ok).toBe(false);
  });
  it("rejects reserved words with ALIAS_RESERVED", () => {
    for (const w of ["api", "admin", "login", "metrics"]) {
      const r = validateAlias(w);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("ALIAS_RESERVED");
    }
  });
  it("is case-insensitive about reserved words", () => {
    expect(validateAlias("ADMIN").ok).toBe(false);
  });
});

describe("isReservedPath", () => {
  it("matches the reserved set", () => {
    expect(isReservedPath("dashboard")).toBe(true);
    expect(isReservedPath("Ab3xK9p")).toBe(false);
    expect(RESERVED_ALIASES.has("health")).toBe(true);
  });
});
