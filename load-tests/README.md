# Load tests (Plan §57)

[k6](https://k6.io) scripts. Run against a **preview** deployment with a seeded
dataset — never production.

```bash
BASE=https://<preview>.vercel.app k6 run load-tests/smoke.js
BASE=https://<preview>.vercel.app k6 run load-tests/redirect.js
BASE=https://<preview>.vercel.app k6 run load-tests/create-url.js
BASE=https://<preview>.vercel.app k6 run load-tests/mixed.js
```

| Script | Workload | Purpose |
|---|---|---|
| `smoke.js` | 1 VU, ~30 s, full happy path | CI / post-deploy gate |
| `redirect.js` | 95% GET `/:code`, 5% POST | redirect-heavy — cache + rate limit behaviour (§57) |
| `create-url.js` | burst of POST `/urls` | abuse / rate-limit ceiling (§57) |
| `mixed.js` | 70% redirect, 20% list, 10% create | balanced (§57) |

Record results per [../docs/performance/methodology.md](../docs/performance/methodology.md).
Toggle a variable (`FEATURE_REDIS_CACHE`, `FEATURE_ASYNC_ANALYTICS`) in the
preview's env between runs and compare.

## Seeding

```bash
# create N anonymous URLs to redirect against
BASE=https://<preview> N=500 node load-tests/seed.mjs > load-tests/results/codes.txt
```
