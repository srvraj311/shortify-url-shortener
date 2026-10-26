import http from "k6/http";
import { check } from "k6";
import { BASE, seedCodes } from "./lib.js";

export const options = {
  scenarios: {
    redirect_heavy: {
      executor: "ramping-vus",
      startVUs: 5,
      stages: [
        { duration: "20s", target: 30 },
        { duration: "40s", target: 30 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    "http_req_duration{name:redirect}": ["p(95)<200", "p(99)<500"],
    "http_req_failed{name:redirect}": ["rate<0.01"],
  },
};

export function setup() {
  return { codes: seedCodes(40) };
}

export default function (data) {
  const roll = Math.random();
  if (roll < 0.05) {
    http.post(`${BASE}/api/v1/urls`, JSON.stringify({ url: `https://example.com/${Date.now()}` }), {
      headers: { "Content-Type": "application/json" },
      tags: { name: "create" },
    });
    return;
  }
  const code = data.codes[Math.floor(Math.random() * data.codes.length)];
  const res = http.get(`${BASE}/${code}`, { redirects: 0, tags: { name: "redirect" } });
  check(res, { "302": (r) => r.status === 302 });
}
