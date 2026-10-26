import http from "k6/http";
import { check } from "k6";
import { BASE, seedCodes } from "./lib.js";

// Balanced workload (Plan §57): 70% redirect, 20% list (auth), 10% create.
export const options = {
  vus: 20,
  duration: "60s",
  thresholds: {
    "http_req_duration{name:redirect}": ["p(95)<250"],
    http_req_failed: ["rate<0.02"],
  },
};

export function setup() {
  // register one user, keep the cookie for the "list" slice
  const email = `load_${Date.now()}@test.local`;
  const reg = http.post(`${BASE}/api/v1/auth/register`, JSON.stringify({ email, password: "loadtest123" }), {
    headers: { "Content-Type": "application/json" },
  });
  const cookie = reg.headers["Set-Cookie"] || "";
  return { codes: seedCodes(30), cookie: cookie.split(";")[0] };
}

export default function (data) {
  const roll = Math.random();
  if (roll < 0.7) {
    const code = data.codes[Math.floor(Math.random() * data.codes.length)];
    const r = http.get(`${BASE}/${code}`, { redirects: 0, tags: { name: "redirect" } });
    check(r, { "302": (x) => x.status === 302 });
  } else if (roll < 0.9) {
    const r = http.get(`${BASE}/api/v1/urls?limit=20`, {
      headers: { Cookie: data.cookie },
      tags: { name: "list" },
    });
    check(r, { "200": (x) => x.status === 200 });
  } else {
    http.post(`${BASE}/api/v1/urls`, JSON.stringify({ url: `https://example.com/m/${Date.now()}` }), {
      headers: { "Content-Type": "application/json" },
      tags: { name: "create" },
    });
  }
}
