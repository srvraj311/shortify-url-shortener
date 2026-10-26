import http from "k6/http";
import { check } from "k6";

export const BASE = __ENV.BASE || "http://localhost:3000";

export function createUrl(target = "https://example.com/load-test") {
  const res = http.post(`${BASE}/api/v1/urls`, JSON.stringify({ url: target }), {
    headers: { "Content-Type": "application/json" },
  });
  check(res, { "create 201/replayed": (r) => r.status === 201 || r.status === 200 });
  try {
    return JSON.parse(res.body).url.shortCode;
  } catch {
    return null;
  }
}

export function seedCodes(n) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const c = createUrl(`https://example.com/seed/${i}`);
    if (c) codes.push(c);
  }
  return codes;
}
