# Backend: setup, checks and deployment (Allen's lane)

## Routes

| Method and path | What it does |
|---|---|
| `GET /api/health` | Data mode, Tiger reachability, store kind, whether Gemini is configured. Returns 503 if degraded. |
| `POST /api/properties/[id]/investigate` | Starts a memo run for a `costar-…` property. Returns `202 { run_id }`, or `200` with the same `run_id` if a run for that property is already going. |
| `GET /api/runs/[id]` | Poll every 2 s. Contract §6 shape: steps, status, and `memo` when done. |
| `GET /api/properties/[id]/memo` | Latest saved memo, always `live: false`, plus `digest_matches`. |
| `GET` / `PUT /api/properties/[id]/review` | This browser's property review (same shape as `lib/propertyReview.ts`). |
| `POST` / `DELETE /api/watchlist` | Unchanged. Saved properties go to `site_watchlist`. |

The memo's verdict and max price come from the valuation, never from Gemini. A memo that quotes a dollar figure we did not supply is rejected. Each memo has a SHA-256 `digest_sha256`, and `attestation.status` is `"unavailable"` until Solana exists.

**Valuation:** the route maps Marvin's `PropertyValuation` into the memo (verdict becomes `recommendation`, `maxLandPricePerAcre` becomes `max_price_usd_per_acre`). Until `web/lib/propertyValuation.ts` lands it uses `sampleValuation()`, and a sample-data Buy is capped at Maybe. The swap is one line in `valueListingForMemo()` in `app/api/properties/[id]/investigate/route.ts`. The POST body is optional: `{"mw": 1.5}` (1.5 is the default).

## First run, in this order

From `web/`, with `DATABASE_URL` and `GEMINI_API_KEY` in the repo-root `.env`:

1. `npm run gemini:smoke`: lists the Gemini models the key can use and makes one real call for the largest Houston listing. Every `FAIL` line names an assumption in `parseOutput()` to fix. If the model is wrong, set `GEMINI_MODEL`.
2. `npm run db:setup`: creates the `gw_dev_*` tables and writes, reads back and deletes a row in each one, plus `site_watchlist`. Every line must say `PASS`.
3. `ENABLE_PROPERTY_INVESTIGATOR=true GW_STORE=postgres npm run dev`, then:
   ```sh
   curl -s localhost:3000/api/health
   curl -s -X POST localhost:3000/api/properties/costar-<ID>/investigate
   curl -s localhost:3000/api/runs/<run_id>
   ```

## Deploy to Vercel

1. Import the GitHub repo and set **Root Directory** to `web`. The framework preset is Next.js and needs no `vercel.json`.
2. Set these environment variables for Production:
   `DATABASE_URL`, `GW_STORE=postgres`, `GEMINI_API_KEY`, `GEMINI_MODEL` (if the smoke test changed it), `VEXCEL_API_KEY`, `ENABLE_PROPERTY_INVESTIGATOR=true`.
   Leave `DATA_MODE` unset for the database demo. Set it to `public` only for the keyless Texas demo.
   - `GW_STORE=postgres` is required on Vercel. With `memory`, the POST and the polling GET can land on different instances and the run looks lost.
   - `after()` keeps the run going after the 202. `maxDuration = 60` needs a plan that allows 60-second functions.
3. Deploy, then check:
   - `https://<app>.vercel.app/api/health` returns `"status":"ok"`, `"tiger":"ok"`, `"store":"postgres"` and `"gemini":"ok"`.
   - Open the listing page for the Houston demo property **on a phone** and start an investigation.
4. Never put sponsor keys in `NEXT_PUBLIC_*` variables.

## Known limits

- The run limit (5 per client per hour) is per process and keyed by a cookie, so it is not a durable public rate limit.
- The Gemini Interactions adapter has not been checked against the live service until step 1 passes.
