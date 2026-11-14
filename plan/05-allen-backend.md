# 05 — Allen: Backend

## Read this first (same in every lane file)

**Build order.** Build the demo table in `00-overview.md` top to bottom. Nothing outside the table until every row works.

| # | When (ET) | Phase | Gate |
|---|-----------|-------|------|
| 1 | Fri now → 1 AM | Kickoff: scope, contract, repo, mocks, keys | Gate 0: all four run web + API locally on mocks |
| 2 | Sat 1 → 4 AM | Skeleton: screens on mocks, formulas coded, endpoints serve mocks, demo parcels picked | Gate A: search → `/rank` → cards with real model numbers |
| 3 | Sat 4 → 9 AM | Sleep in two shifts | — |
| 4 | Sat 9 AM → 1 PM | Real data, slider re-rank, break-even, parcel verdict | Gate B: demo rows 2–6 work without the agent |
| 5 | Sat 1 → 6 PM | Agent, report view, Tiger Data history, watchlist | Gate C: agent report for one Houston parcel from the UI |
| 6 | Sat 6 → 11 PM | Deploy (Vultr by 5 PM, DNS by 7 PM), polish | Gate D: full demo on the public URL from a phone |
| 7 | Sat 11 PM → Sun 3 AM | Freeze: bugs only, pre-generate reports, secrets audit | Gate E: release candidate tagged |
| 8 | Sun 3 → 7:30 AM | README, video, Devpost, rehearse | Submitted by 7:30. Hard stop 8:00 AM |

**Things everyone must know.**

1. **The agent is core, not an add-on.** CoStar scores 30% agentic depth and 30% data use; Amazon and LangChain are also agent-driven. It starts at 1 PM Saturday at the latest.
2. **CoStar is not a housing prize.** It wants an agent that combines at least two of CoStar, Vexcel, and Matterport and shows spatial or visual understanding. The parcel investigation is our entry.
3. **Sponsor data never goes in the repo.** CoStar is a file download from `/costar-keys`, not an API. It, Vexcel responses, and Matterport responses are hackathon-use only and live in `data/private/` (git-ignored). No sponsor keys in the browser except the Matterport SDK key.
4. **Sponsor data fields are unverified.** Nobody has seen the real CoStar columns or Vexcel attributes yet. Noah reports what exists in Phase 1. Until then, anything in the contract's `costar`, `vexcel`, and `matterport` blocks may change, and missing fields are `null` / "Unknown", never invented.
5. **Model constants are starting values.** Build cost per MW, water ratios, and orbit mass figures are marked `assumed` until Marvin confirms each from a source in `docs/assumptions.md`. Don't quote a number in the pitch that isn't confirmed.
6. **The deepagents API differs by version.** Copy argument names from the installed version's docs.
7. **Peri needs a real consult.** Business name, person's name and role, and evidence from this weekend. Replaying a cancelled project doesn't qualify. No consult, no entry.
8. **Rules that disqualify:** public repo created Nov 13–15; 85% of code written during the event; credit every library; one main track (Business & Enterprise); all four on Devpost with Discord names; no embellishing; everyone can explain their own code.
9. **Every number carries a tag:** `reported`, `modeled`, `assumed`, or `sample`.
10. **Never present a saved agent run as live.** Saved reports show their timestamp and a "Saved report" label.
11. **Blocked for 30 minutes on a data source?** Hardcode a labeled sample and move on.

**What this means for you (Allen).** You are the hub: AJ calls your routes, and your routes call Marvin's functions and Noah's data functions. Three rules keep you from being the bottleneck:

- Every route exists and serves its mock before 1 AM, so AJ never waits.
- You never write formulas (Marvin) or data clients (Noah). You import them. If one isn't ready, the route keeps serving the mock or a `sample`.
- You own the repo, the contract after the freeze, the database, the deployment, and the secrets audit. You also merge pull requests (see `07-git-workflow.md`).

Your files: `api/`, `mocks/`, `.github/`, `Dockerfile`, `.env.example`, `.gitignore`, `Makefile`.

Working order for every endpoint: serve the mock file → call the real function with sample data → real data.

## Phase 0 — Kickoff (now → 1:00 AM)

### 1. Repo (do this first, alone, in 10 minutes, so everyone else can clone)

1. Create a new **public** GitHub repo now (it must be created Nov 13–15).
2. Add AJ, Marvin, and Noah as collaborators with write access (Settings → Collaborators).
3. First commit on `main`:
   1. Folders with a `.gitkeep` each: `web/`, `api/`, `model/`, `agent/`, `datasources/`, `scripts/`, `mocks/`, `data/`, `docs/`.
   2. `.gitignore`: `.env*` (except `.env.example`), `.venv/`, `node_modules/`, `.next/`, `__pycache__/`, `data/private/`, `agent/samples/private/`, `*.pem`.
   3. `.env.example` with names only:
      ```
      GEMINI_API_KEY=
      TIGER_DATABASE_URL=
      MP_API_KEY=
      MP_API_TOKEN=
      MP_SDK_KEY=
      VEXCEL_API_KEY=
      EIA_API_KEY=
      SEARCH_API_KEY=
      ADMIN_SECRET=
      FRONTEND_ORIGINS=http://localhost:3000
      ```
   4. Copy the `plan/` folder in.
4. Push, then post the clone URL. Follow `07-git-workflow.md` from here.
5. Protect `main`: Settings → Branches → require a pull request before merging. No required reviews (too slow); the PR itself is the checkpoint.
6. Real secrets are shared by private DM or a password manager, never in the repo or a public channel.

### 2. API skeleton

1. `python -m venv .venv`, then `pip install fastapi "uvicorn[standard]" pydantic httpx python-dotenv "psycopg[binary]" pytest`. Write `requirements.txt` at the repo root; Marvin and Noah add their packages to it through you (it is a shared file).
2. `api/main.py`: the app, CORS from `FRONTEND_ORIGINS`, a middleware that assigns a request ID and logs method, path, status, and duration.
3. `api/schemas.py`: Pydantic models for every request in `01-contract.md`. Validation: MW greater than 0 and at most 2000; year not in the past; `priority` one of the four values.
4. `GET /health` per the contract.
5. `serve_mock(name)` helper that returns `mocks/<name>.json`.
6. Create every route in the contract, each returning its mock. Push to `main` through a PR. Announce: "All routes live on mocks at localhost:8000, docs at /docs."
7. `Makefile`: `make api` runs `uvicorn api.main:app --reload --port 8000`; `make web` runs the frontend; `make test` runs pytest.

### 3. Mocks

1. Copy every example from `01-contract.md` into `mocks/` as real JSON with plausible placeholder numbers.
2. Add `mocks/run.running.json` and `mocks/run.done.json` for AJ's report view.

### 4. Accounts

1. Create the Tiger Data service (free trial). Put the connection string in the shared secrets.
2. Redeem the MLH Vultr credit now; account approval can take time.
3. Connect your coding agent to ChatOverflow.

Done when (Gate 0): all four have web and API running locally against mocks.

## Phase 1 — Wire the model (1:00 → 4:00 AM)

### 5. `/rank`

1. Import Marvin's `model.rank()`.
2. `api/regions.py`: at startup, load `data/regions.json` into memory. Until Noah's file exists, load Marvin's `model/fixtures/regions.json` (marked `sample`).
3. Map `priority` to weights (table in Marvin's file). Merge the request's `assumptions` over the defaults.
4. No network or database calls inside `/rank`. Target under 100 ms; AJ's slider calls it on every drag.
5. Return 422 on bad input with a readable `detail`.

### 6. `/options/{id}/breakdown`

Call Marvin's `breakdown()` with the region row. Attach `context` and `sources` from Noah's `data/sources.json` when it exists.

### 7. Tests (`api/tests/`)

1. `/health` returns ok.
2. `/rank` with the standard 100 MW request returns seven options, ranks 1–7, orbit present.
3. `/rank` with negative MW returns 422.
4. Unknown `option_id` returns 404.

Done when (Gate A): AJ's search shows model numbers from `/rank`.

## Phase 2 — Parcels (9:00 AM → 1:00 PM)

### 8. Parcel routes (Noah provides the data functions; you provide the HTTP)

1. `GET /regions/{id}/parcels`: call `datasources.parcels.list_parcels(region_id)`, then Marvin's `parcel_verdict()` for each to fill `verdict` and `verdict_reason`. Cache the result per assumptions hash.
2. `POST /parcels/{id}/verdict`: gather `datasources.costar.get_record`, `datasources.vexcel.get_attributes`, `datasources.matterport.get_summary`, the region row, and the other regions as alternatives; call `parcel_verdict()`; return the contract shape.
3. `GET /parcels/{id}/image?kind=ortho|oblique&size=`: return bytes from `datasources.vexcel.get_image_bytes` with the right content type and a cache header. Keys never reach the browser.
4. Any data function that raises or returns `None` becomes a `null` field plus a string in `warnings`. The route still returns 200.
5. Until Noah's functions land, these routes stay on mocks. Swap one at a time as he announces each.

### 9. Speed check with AJ

Measure `/rank` round trip from the browser. If it's over about 200 ms, precompute everything that doesn't depend on slider values at startup.

Done when (Gate B): region page and both demo parcels work on real data.

## Phase 3 — Database, watchlist, agent plumbing (1:00 → 6:00 PM)

Start step 12 first; Marvin needs it at 1 PM.

### 10. Schema (`api/db/schema.sql`)

```sql
CREATE TABLE metric_history (
  time        TIMESTAMPTZ NOT NULL,
  ref_id      TEXT NOT NULL,      -- region or parcel id
  metric      TEXT NOT NULL,      -- electricity_price, score, rank, breakeven_launch_cost
  value       DOUBLE PRECISION NOT NULL,
  unit        TEXT NOT NULL,
  kind        TEXT NOT NULL,      -- reported | modeled
  source_id   TEXT,
  PRIMARY KEY (ref_id, metric, time)
);
SELECT create_hypertable('metric_history', 'time');

CREATE TABLE watchlist (
  item_id    TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL,
  kind       TEXT NOT NULL,
  ref_id     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, kind, ref_id)
);

CREATE TABLE agent_runs (
  run_id TEXT PRIMARY KEY, parcel_id TEXT, status TEXT,
  steps JSONB, report JSONB, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
);
```

1. Check the Tiger Data docs for the current hypertable syntax on your service before running it.
2. `api/db/conn.py`: a small connection pool and `insert_metrics(rows)`, `query(sql, params)`. Noah's load scripts call `insert_metrics`.
3. Tell Noah the table is ready; he loads the EIA history and score backfill (his Phase 3).

### 11. Watchlist and history routes

1. `POST`, `GET`, `DELETE /watchlist` per the contract, scoped by the `X-Client-Id` header.
2. History for the sparkline:
   ```sql
   SELECT time_bucket('1 month', time) AS t, avg(value)
   FROM metric_history WHERE ref_id = $1 AND metric = 'score'
   GROUP BY t ORDER BY t;
   ```
3. Latest versus previous, for "what changed":
   ```sql
   SELECT metric, last(value, time) AS current,
          (array_agg(value ORDER BY time DESC))[2] AS previous
   FROM metric_history WHERE ref_id = $1 GROUP BY metric;
   ```
4. Build `changes` sentences from templates, for example "Electricity price rose 6%. Rank moved from 1 to 2." Only real differences produce a change.
5. `GET /options/{id}/history?metric=` returns chart-ready points.
6. `POST /admin/refresh`, guarded by the `ADMIN_SECRET` header: calls Noah's `scripts.refresh.run()` to pull the newest EIA month and recompute. This is how the demo's "what changed" appears from real data.
7. If the database is down: watchlist returns 503; `/rank`, `/breakdown`, and parcels still work.

### 12. Agent run plumbing (with Marvin)

1. Storage functions in `api/db/runs.py`: `save_run`, `update_run_steps`, `finish_run`, `load_run`, `load_previous_report(parcel_id)`. Marvin's agent calls these.
2. Before the database is ready, back them with an in-memory dict so Marvin can start at 1 PM.
3. `POST /parcels/{id}/investigate`: calls Marvin's `agent.run.start_run`, returns `run_id`. If a run for that parcel is already running, return that `run_id`.
4. `GET /runs/{id}`: reads the run. A report loaded from an earlier run is returned with `live: false`.
5. Run the agent in a background task so the request returns immediately. Enforce Marvin's 3-minute timeout here too.
6. If Gemini is down, `/investigate` returns 503 and nothing else is affected.

Done when (Gate C): Investigate works from the UI, and the watchlist shows one real change.

## Phase 4 — Deploy (start by 5 PM; finish 6:00 → 11:00 PM)

### 13. Vultr

1. Create a small Ubuntu cloud instance. Screenshot the dashboard for the prize entry.
2. Firewall: allow 22, 80, 443 only.
3. `Dockerfile`: Python slim image; copy `api/`, `model/`, `agent/`, `datasources/`, `scripts/`, `data/regions.json`, `data/sources.json`, `mocks/`; install requirements; run uvicorn on port 8000.
4. On the server: install Docker, clone the repo, write `.env` by hand, copy `data/private/` over with `scp` (it is not in git), build, run with `--restart unless-stopped`.
5. HTTPS: when Noah has the domain, point `api.<domain>` at the server and run Caddy as a reverse proxy (automatic certificates). Before that, have AJ proxy API calls through the frontend host so the browser doesn't block mixed content.
6. Set `FRONTEND_ORIGINS` to the final domain plus localhost.
7. Run Noah's `scripts/warm_cache.py` on the server.
8. Smoke test from a phone on mobile data: `/health`, search, region, parcel, investigate, watchlist.

### 14. CI (only if deploy is done)

GitHub Actions on pull requests: `pytest` and `npm run build` in `web`. Spend at most ten minutes on it.

Done when (Gate D): a teammate runs the whole demo on the public URL from their phone.

## Phase 5 — Freeze (Sat 11 PM → Sun 7:30 AM)

1. Secrets audit.
   1. `git log -p | grep -iE "key|token|secret|password"` and read every hit.
   2. `git log --all --name-only | grep -i private` must return nothing.
   3. A leaked key gets rotated, not just deleted.
2. No API response contains a key. Check image URLs.
3. Degradation check: stop the database, then unset the Gemini key, then block Vexcel. The app must behave as the contract's error table says.
4. Merge the last PRs, tag `v1.0-submission` on `main`, confirm the repo is public in a private browser window.
5. Keep a laptop ready to run the backend locally during judging.
6. During judging, tail the server logs on a second device.

## If you're blocked

- Marvin's function not ready: keep the mock.
- Noah's data function not ready: keep the mock, or call the model with `sample` rows.
- Tiger Data won't provision: Postgres in Docker on the Vultr box, same schema without the hypertable call; tell Noah to drop that prize from the Devpost.
- Idle: write `docs/architecture.md` (ten lines and one diagram) for Noah's README.
