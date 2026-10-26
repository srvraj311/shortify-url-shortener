import http from "k6/http";
import { check, sleep } from "k6";
import { BASE } from "./lib.js";

// Happy-path smoke test for CI / post-deploy gate.
export const options = { vus: 1, duration: "20s", thresholds: { checks: ["rate>0.99"] } };

export default function () {
  check(http.get(`${BASE}/health`), { "health ok": (r) => r.status === 200 });
  check(http.get(`${BASE}/ready`), { "ready ok": (r) => r.status === 200 });

  const create = http.post(`${BASE}/api/v1/urls`, JSON.stringify({ url: "https://example.com/smoke" }), {
    headers: { "Content-Type": "application/json" },
  });
  check(create, { "create 201": (r) => r.status === 201 });
  const code = JSON.parse(create.body).url.shortCode;

  const redirect = http.get(`${BASE}/${code}`, { redirects: 0 });
  check(redirect, {
    "redirect 302": (r) => r.status === 302,
    "redirect location": (r) => r.headers["Location"] === "https://example.com/smoke",
  });

  check(http.get(`${BASE}/${code.slice(0, 3)}zzz`, { redirects: 0 }), {
    "unknown -> 404": (r) => r.status === 404,
  });
  sleep(1);
}
