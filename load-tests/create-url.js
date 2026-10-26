import http from "k6/http";
import { check } from "k6";
import { BASE } from "./lib.js";

// Abuse workload (Plan §57): a large burst of POSTs from few sources. Expect the
// rate limiter to start returning 429 with Retry-After once the bucket drains.
export const options = {
  scenarios: {
    burst: { executor: "constant-arrival-rate", rate: 50, timeUnit: "1s", duration: "30s", preAllocatedVUs: 50 },
  },
  thresholds: {
    "checks{check:rate-limited-eventually}": ["rate>0"],
  },
};

export default function () {
  const res = http.post(
    `${BASE}/api/v1/urls`,
    JSON.stringify({ url: `https://example.com/burst/${__VU}/${__ITER}` }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "create" } },
  );
  check(res, {
    "created or limited": (r) => [201, 200, 429].includes(r.status),
    "rate-limited-eventually": (r) => r.status === 429,
    "429 has Retry-After": (r) => r.status !== 429 || !!r.headers["Retry-After"],
  });
}
