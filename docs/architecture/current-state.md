# Current state — V0 baseline

> Snapshot of the pre-existing application, kept verbatim under [`/legacy`](../../legacy).
> This is the "V0" the plan says to treat as the starting point, not throw away.

## Shape

```
Browser (Angular 13 SPA)
      |
      v
Express 4 monolith  (index.js)   ── deployed as one @vercel/node function
      |
      v
MongoDB Atlas  (collections: urls, salt)
```

## What V0 did

| Endpoint | Behaviour |
|---|---|
| `POST /api/` | Validate URL with `validator.isURL`, read+increment a global `salt` counter doc, build a code from `(61 + salt)` interleaved with random A–Z letters, `save()` (fire-and-forget), return `{ url: code }`. |
| `GET /:key` | `Url.findOne({ short: key })`, `res.redirect(doc.url)` or 404. |

Frontend: a single component with one text box that POSTs and shows the result.

## Documented weaknesses (Plan §5)

| Gap | Consequence |
|---|---|
| No authentication / authorization | Anyone can create; nobody owns anything; no management. |
| No unique index on `short` | `getSalt()` does read-modify-write with **no atomicity** → two concurrent requests can read the same salt and mint colliding codes; `save()` is not awaited so failures are silent. |
| `check-then-insert` mindset | Race-prone by construction (Plan §9). |
| No rate limiting | Trivial to flood; one abuser degrades everyone. |
| No caching | Every redirect is a Mongo round-trip. |
| No analytics | No idea what is clicked. |
| No search / pagination | `GET /api/urls` would return everything (there is no such endpoint yet). |
| No idempotency | A retried create makes a second URL. |
| No observability | No request IDs, structured logs, or metrics. |
| No fault isolation | Mongo blip = full outage. |
| No async processing | Nothing to decouple; but also nowhere to put analytics without slowing redirects. |
| No abuse controls | Open redirect to anything, including `javascript:` (only `isURL` default checks). |
| Secrets in git | `config.json` committed a live Atlas URI with credentials. **Rotate.** |

## Measured V0 characteristics

- Redirect = 1 indexed-ish query (`short` had no explicit index, so a COLLSCAN as the collection grows).
- Create = 1 read + 1 write to `salt` (contended hot document) + 1 unawaited write to `urls`.
- Cold start: Express + mongoose connect on every cold invocation; no connection reuse guard.

These are the baselines the new system is measured against (see [performance/methodology.md](../performance/methodology.md)).
