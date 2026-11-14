# 04 — Allen: Backend

You own the API, the two databases, the agent run plumbing, the deployment, and the contract after it is frozen. AJ calls your routes; your routes call Marvin's functions and Noah's data functions.

**Your folders:** `api/`, `mocks/`, `.github/`, plus `Dockerfile`, `Makefile`, `requirements.txt`, `.env.example`, `.gitignore`. **Your branch:** `lane/backend`.

## Read this first (same in every lane file)

**Product.** Groundwork: a listings site where a business searches for land to build an AI data center on and gets, for each prospect, a Buy / Maybe / Pass verdict, the most it's worth paying, the ten-year cost, the deal risks, and an agent-written investment memo. Markets and orbit are context on a separate tab.

**Schedule (Eastern).** Build the demo table in `00-overview.md` top to bottom.

| Phase | When | Goal | Gate |
|-------|------|------|------|
| 0 | Sat now → 2 AM | Kickoff, skeleton, mocks, keys | 0: everyone runs web + API on mocks |
| 1 | Sat 2 → 5 AM | Screens on mocks, formulas coded, sponsor data opened | A: search → prospects with model numbers (sample data) |
| — | Sat 5 → 9 AM | Sleep in two shifts | — |
| 2 | Sat 9 AM → 1 PM | Real CoStar + Vexcel data, verdict, prospect page | B: demo rows 2–4 and 6 on real data |
| 3 | Sat 1 → 6 PM | Agent memo, MongoDB, Tiger history, watchlist, Markets | C: memo for a Houston prospect from the UI |
| 4 | Sat 6 → 11 PM | Vultr, domain, Solana, polish | D: full demo on the public URL from a phone |
| 5 | Sat 11 PM → Sun 3 AM | Freeze: bugs only | E: release candidate tagged |
| 6 | Sun 3 → 7:30 AM | README, video, Devpost, rehearse | Submitted by 7:30. Hard stop 8:00 |

**Rules for everyone.**

1. Sponsor data (CoStar, Vexcel, Matterport) never goes in git. It lives in `data/private/` and MongoDB.
2. No secrets in git. No sponsor keys in the browser, except the Matterport SDK key.
3. Unknown is `null` and shows as "Unknown". Never invent a value.
4. Every number carries a tag: `reported`, `modeled`, `assumed`, `sample`.
5. Numbers come from Marvin's formulas. The agent quotes them; it never makes them up.
6. A saved memo is never shown as live. It shows its timestamp and a "Saved" label.
7. Only edit your own folders. Need a change elsewhere? Ask the owner.
8. Blocked 30 minutes on a data source? Use a labeled sample and move on.
9. Hackathon rules: public repo, 85% of code written this weekend, credit every library, don't embellish, be able to explain your own code.
10. We code in Claude Code. We do not enter SpaceXSI.

## How you stay off the critical path

1. Every route exists and serves its mock by 2 AM, so AJ never waits.
2. You never write formulas (Marvin) or data clients (Noah). You import them. If one isn't ready, the route keeps serving its mock.
3. Every storage function works against an in-memory dict first, so Marvin never waits on a database.

For each route: mock → real function on sample data → real data.

## What you depend on

| You need | From | Until it exists |
|----------|------|-----------------|
| `model.prospect_list`, `parcel_verdict`, `rank`, `breakdown` | Marvin | Serve the mock |
| `datasources.parcels.load_prospects`, `regions.load_regions` | Noah | Marvin's fixtures |
| `datasources.vexcel`, `costar`, `matterport` functions | Noah | Mock for that field |
| `agent.run.start_run` | Marvin | Mock run files |
| `attest.attest_memo`, `attest.verify_memo` | Noah | Mock attest and verify files |
| `scripts.refresh.run` | Noah | Route returns 503 |

## What you hand over

`api/store.py`, imported by Marvin's agent and Noah's scripts:

```python
upsert_prospects(rows)            all_prospects() -> list
save_run(run) -> run_id           update_run_steps(run_id, steps)
finish_run(run_id, status, memo=None, error=None)
load_run(run_id)                  running_run_for(parcel_id) -> run_id | None
save_memo(memo) -> memo_id        load_memo(memo_id)        load_previous_memo(parcel_id)
save_attestation(memo_id, att)    load_attestation(memo_id)
insert_metrics(rows)              # Tiger Data
```

## Phase 0 — Skeleton (now → 2 AM)

### 1. First commit (do this alone, first, in about 10 minutes)

AJ already created the repo (`abayate/hackathonprinceton`) with `plan/`, the README, and a `.gitignore`.

1. Accept the collaborator invite and clone it.
2. On `main`, add empty folders with a `.gitkeep` each: `web/`, `api/`, `model/`, `agent/`, `datasources/`, `attest/`, `scripts/`, `mocks/`, `data/`, `docs/`.
3. Add `.env.example` (names only):
   ```
   GEMINI_API_KEY=
   MONGODB_URI=
   MONGODB_DB=groundwork
   TIGER_DATABASE_URL=
   MP_API_KEY=
   MP_API_TOKEN=
   MP_SDK_KEY=
   VEXCEL_API_KEY=
   EIA_API_KEY=
   SEARCH_API_KEY=
   SOLANA_RPC_URL=https://api.devnet.solana.com
   SOLANA_KEYPAIR_PATH=
   ADMIN_SECRET=
   FRONTEND_ORIGINS=http://localhost:3000
   ```
4. Check `.gitignore` covers `.env*` (except `.env.example`), `data/private/`, `agent/samples/private/`, `.venv/`, `node_modules/`, `.next/`, `__pycache__/`, `*.pem`, `*.json` keypairs outside the repo.
5. Push. Post: "Skeleton is on main. Pull and create your branch." This is the one push to `main` without a pull request; everything after goes through one (`06-git-workflow.md`).
6. Real secrets travel by private DM or a password manager only.

### 2. Contract review (all four, about 30 minutes)

1. Lead the walk-through of `01-contract.md`. Fix names. Everyone ticks the sign-off.
2. Create every mock file listed at the bottom of the contract, with plausible placeholder numbers. Push through a pull request and merge it.

### 3. API skeleton

1. `git checkout -b lane/backend`.
2. `python -m venv .venv`, then install `fastapi "uvicorn[standard]" pydantic httpx python-dotenv pymongo "psycopg[binary]" pytest`. Write `requirements.txt` at the repo root. Marvin and Noah tell you their packages; you add them.
3. `api/main.py`: the app; CORS from `FRONTEND_ORIGINS`; a middleware that assigns a request ID and logs method, path, status, and duration.
4. `api/schemas.py`: Pydantic models for every request. MW greater than 0 and at most 2000; year not in the past; `priority` and `market` from their allowed values.
5. `api/mock.py`: `serve_mock(name)` returns `mocks/<name>.json`.
6. Create all 13 endpoints from the contract, each returning its mock.
7. `Makefile`: `make api` (`uvicorn api.main:app --reload --port 8000`), `make web`, `make test`.
8. Pull request, merge, announce: "All routes live on mocks at localhost:8000. Docs at /docs."

### 4. Accounts (start now; approvals take time)

1. MongoDB Atlas: free cluster, database user, connection string. Allow your team's IPs for now.
2. Tiger Data: create the service, copy the connection string.
3. Vultr: redeem the MLH credit.
4. Put the connection strings in the team's private secrets.
5. Connect Claude Code to ChatOverflow.

Done when (Gate 0): all four run web and API locally against mocks.

## Phase 1 — Prospects route and stores (2 → 5 AM)

### 5. `POST /prospects`

1. At startup, load prospects and regions into memory: from Noah's `load_prospects()` and `load_regions()` if they exist, otherwise Marvin's fixtures.
2. Per request: validate, merge `assumptions` over defaults, call `model.prospect_list()`, return it.
3. No network or database call inside the request. This is the first page a judge sees.
4. 422 on bad input with a readable `detail`.

### 6. Stores, in memory first (`api/store.py`)

1. Implement every function in "What you hand over" against plain dicts.
2. `load_previous_memo(parcel_id)` returns the most recent memo for that prospect, or `None`.
3. Announce it. Marvin can now build the agent against it.

### 7. Tests (`api/tests/`)

1. `/health` returns ok.
2. `/prospects` with the standard request returns ranked prospects, ranks starting at 1.
3. Negative MW returns 422. Unknown `parcel_id` returns 404.

Done when (Gate A): AJ's search shows model numbers from `/prospects`.

## Phase 2 — Prospect detail (9 AM → 1 PM)

### 8. `POST /parcels/{id}/verdict`

1. Look up the prospect in memory. 404 if missing.
2. Build `site` from `datasources.vexcel.get_attributes(id)` and `datasources.matterport.get_summary(id)`. Each call is wrapped: an exception or `None` becomes a `null` field and a string in `warnings`.
3. Call `model.parcel_verdict(parcel, site, workload, assumptions, region, alternatives)`.
4. Add the `costar`, `vexcel`, and `matterport` blocks, image URLs pointing at your proxy, `latest_memo_id`, and `sources`.

### 9. `GET /parcels/{id}/image`

1. Return bytes from `datasources.vexcel.get_image_bytes(id, kind)` with the right content type and a one-day cache header.
2. `size=thumb`: downscale with Pillow (add it to requirements) and cache the result on disk.
3. 404 when there is no image. Keys never appear in a URL the browser sees.

### 10. Reload when Noah's data lands

1. When Noah announces real prospects and regions, reload at startup from his functions (and from MongoDB once step 11 is done).
2. Update `01-contract.md` and the mocks for any field that differs from the provisional `costar`, `vexcel`, and `matterport` blocks. Announce the change.
3. Measure `/prospects` from the browser with AJ. Target under 300 ms.

Done when (Gate B): the listing and both demo prospects work on real data.

## Phase 3 — Databases, agent plumbing, watchlist, markets (1 → 6 PM)

Do step 12 first; Marvin needs it at 1 PM.

### 11. MongoDB Atlas behind the stores

1. `api/db/mongo.py`: one client from `MONGODB_URI`.
2. Collections and indexes:

| Collection | Unique index | Other index |
|------------|--------------|-------------|
| `prospects` | `parcel_id` | `market_id` |
| `agent_runs` | `run_id` | `parcel_id` |
| `memos` | `memo_id` | `parcel_id`, `generated_at` |
| `watchlist` | `client_id` + `kind` + `ref_id` | — |
| `attestations` | `memo_id` | — |

3. Swap each store function to MongoDB behind the same name. Keep the in-memory version as the fallback when `MONGODB_URI` is unset.
4. Noah's `scripts/load_prospects.py` calls `upsert_prospects`. At startup, `all_prospects()` fills the in-memory copy used by `/prospects`.
5. If Atlas is unreachable: watchlist, investigate, and attest return 503; prospects, verdict, and rank keep working.

### 12. Agent routes

1. `POST /parcels/{id}/investigate`: if `running_run_for(id)` returns a run, return its ID. Otherwise call `agent.run.start_run(id, workload, assumptions)` and return the new ID. 503 if Gemini is not configured.
2. `GET /runs/{id}`: return `load_run(id)`. A memo loaded from storage on a later request is returned with `live: false`.
3. The run must not block the request. Marvin starts a thread; you also enforce the 3-minute limit by marking a run `error` if it is still `running` after that.

### 13. Tiger Data

1. `api/db/schema.sql`:
   ```sql
   CREATE TABLE metric_history (
     time      TIMESTAMPTZ NOT NULL,
     ref_id    TEXT NOT NULL,     -- parcel_id or market id
     metric    TEXT NOT NULL,     -- electricity_price | score | max_price_usd_per_acre | rank
     value     DOUBLE PRECISION NOT NULL,
     unit      TEXT NOT NULL,
     kind      TEXT NOT NULL,     -- reported | modeled
     source_id TEXT,
     PRIMARY KEY (ref_id, metric, time)
   );
   SELECT create_hypertable('metric_history', 'time');
   ```
   Check the Tiger Data docs for the current hypertable syntax before running it.
2. `insert_metrics(rows)` in the store. Tell Noah the table is ready; he loads the history.
3. `GET /history`:
   ```sql
   SELECT time_bucket('1 month', time) AS t, avg(value) AS value
   FROM metric_history WHERE ref_id = %s AND metric = %s
   GROUP BY t ORDER BY t;
   ```

### 14. Watchlist

1. `POST`, `GET`, `DELETE` per the contract, scoped by `X-Client-Id`.
2. For each item, latest versus previous value per metric:
   ```sql
   SELECT metric, (array_agg(value ORDER BY time DESC))[1] AS current,
                  (array_agg(value ORDER BY time DESC))[2] AS previous
   FROM metric_history WHERE ref_id = %s GROUP BY metric;
   ```
3. Build `changes` from templates: "Electricity price rose 6%. Max price fell from $X to $Y per acre." Only real differences produce a change.
4. `POST /admin/refresh` with the `X-Admin-Secret` header calls Noah's `scripts.refresh.run()`. This is how a real change appears during the demo.

### 15. Markets routes

`POST /rank` calls `model.rank()`; `POST /options/{id}/breakdown` calls `model.breakdown()`. No network or database calls inside `/rank`; the slider hits it on every drag.

Done when (Gate C): Investigate works from the UI; a saved prospect shows one real change; the Markets tab loads.

## Phase 4 — Deploy, then Solana (start the deploy by 5 PM)

### 16. Vultr

1. Create a small Ubuntu instance. Screenshot the dashboard for the prize entry.
2. Firewall: ports 22, 80, 443 only.
3. `Dockerfile`: Python slim; copy `api/`, `model/`, `agent/`, `datasources/`, `attest/`, `scripts/`, `mocks/`, and the public files in `data/`; install requirements; run uvicorn on 8000.
4. On the server: install Docker, clone the repo, write `.env` by hand, copy `data/private/` and the Solana keypair with `scp`, build, run with `--restart unless-stopped`.
5. Add the server's IP to Atlas network access.
6. HTTPS: when Noah has the domain, point `api.<domain>` at the server and run Caddy as a reverse proxy. Before that, have AJ route API calls through the frontend host's rewrite so the browser isn't blocked by mixed content.
7. `FRONTEND_ORIGINS`: the final domain plus localhost.
8. Run Noah's `scripts/warm_cache.py` and `scripts/load_prospects.py` on the server.
9. Smoke test from a phone on mobile data: health, search, prospect, investigate, watchlist, markets.

### 17. Solana routes (after the deploy works)

1. `POST /memos/{id}/attest`: if a confirmed attestation exists, return it. Otherwise call `attest.attest_memo(memo)`, save the result, return it.
2. `GET /memos/{id}/verify`: call `attest.verify_memo(memo, attestation)` and return it.
3. If the RPC can't be reached, the status is `unavailable`. It is never `verified` by default.
4. Tests: attesting twice returns the same signature; verifying a memo with one changed character returns `mismatch`.

### 18. CI (only if everything above works)

GitHub Actions on pull requests: `pytest`, and `npm run build` in `web`. Ten minutes at most.

Done when (Gate D): a teammate runs the full demo on the public URL from a phone.

## Phase 5 — Freeze (Sat 11 PM → Sun 7:30 AM)

1. Secrets audit:
   1. `git log -p | grep -iE "key|token|secret|password|mongodb\+srv"` and read every hit.
   2. `git log --all --name-only | grep -i private` returns nothing.
   3. A leaked key is rotated, not just deleted.
2. No API response contains a key. Check image URLs.
3. Degradation check, one at a time: unset `MONGODB_URI`; unset `TIGER_DATABASE_URL`; unset `GEMINI_API_KEY`; break `SOLANA_RPC_URL`; block Vexcel. Each must behave as the contract's error table says.
4. Merge the last pull requests. Tag `v1.0-submission` on `main`. Confirm the repo is public in a private browser window.
5. Keep a laptop ready to run the backend locally during judging. Tail the server logs on a second device.

## If you're blocked

- A function from Marvin or Noah isn't ready: keep the mock.
- Atlas won't connect: stay on the in-memory store; tell Noah to drop the MongoDB entry.
- Tiger Data won't provision: `/history` returns 503 and watchlist shows no changes; tell Noah to drop the Tiger entry.
- Vultr is broken at Gate D: run the backend on a laptop for judging; tell Noah to drop the Vultr entry.
- Idle: write `docs/architecture.md` (ten lines and one diagram) for Noah's README.
