# 06 — Noah: Data

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

**What this means for you (Noah).** Points 3 and 4 are yours, and three people wait on point 4:

- The sponsor data check (Phase 1, step 3) is the most time-critical task on the team. Post the real field list and the demo parcel IDs by 4 AM so Marvin can set verdict thresholds, AJ can finalize the parcel page, and Allen can fix the contract.
- You write data functions; Allen turns them into routes; Marvin's agent calls them as tools. Keep each function's signature stable once announced.
- Your coding load drops after Gate B. From then you also own the domain, the README, the docs, and the Devpost draft, and you are AJ's backup on frontend pages.

Your files: `datasources/`, `scripts/`, `data/` (public files only), `docs/`, `README.md`. Never `api/` (Allen) or `model/`, `agent/` (Marvin).

## What you hand over (the interface)

Everything is a plain Python function in the `datasources/` package. Each returns a dict whose values carry `kind` and `source_id`, or `None` when the data doesn't exist.

| Function | Returns | Used by |
|----------|---------|---------|
| `regions.load_regions()` | list of region rows | Allen `/rank`, `/breakdown` |
| `regions.get_region_context(option_id)` | price, water stress, grid carbon, crowding | Marvin's agent |
| `parcels.list_parcels(region_id)` | demo parcels for Houston or LA | Allen |
| `costar.get_record(parcel_id)` | property type, acres, building SF, price, vacancy | Allen, agent |
| `vexcel.get_attributes(parcel_id)` | attributes, `homes_distance_m`, flood or terrain flag | Allen, agent |
| `vexcel.get_image_bytes(parcel_id, kind)` | JPEG or PNG bytes, ortho or oblique | Allen image route, agent vision tool |
| `matterport.get_summary(parcel_id)` | model ID, floor area, room count, or `None` | Allen, agent |
| `search.web_search(query)` | list of title, URL, snippet | agent community subagent |
| `scripts.refresh.run()` | pulls newest EIA month, recomputes, inserts | Allen `/admin/refresh` |

Write each function's stub (returning a `sample`) first and push it, so Allen and Marvin can import it immediately. Then fill in the real body.

## Phase 0 — Kickoff (now → 1:00 AM)

1. Join the kickoff and sign the contract. Focus on the `costar`, `vexcel`, `matterport`, and `context` blocks.
2. Clone the repo, create your branch (`07-git-workflow.md`).
3. Get the keys. Start now; some take time.
   1. In the CoStar track Discord run `/costar-keys`. Accept the terms, enter the team name. You receive the Matterport API key and token, the Matterport SDK key, the Vexcel key, and the download link and password for the CoStar extract. Teammates can run it and join the same team.
   2. Register for an EIA API key (free, arrives by email).
   3. Put all keys in the team's private secrets, and tell Allen the variable names match `.env.example`.
4. `pip install httpx pandas python-dotenv`; ask Allen to add them to `requirements.txt`.
5. Create `datasources/__init__.py` and one file per source with the stub functions above. Push.
6. Connect your coding agent to ChatOverflow.

## Phase 1 — Look at the sponsor data (1:00 → 4:00 AM)

### 3. Sponsor data check (deadline: 4 AM)

1. **CoStar extract.**
   1. Download into `data/private/costar/`. It is a data dump, not an API.
   2. Open it with pandas. Write down: file format, row count per city, and the column names for address, lat/lon, property type, land area, building area, sale or asking price, vacancy, zoning.
   3. Find how records link to Matterport spaces and Vexcel regions (a shared ID, or address). If it isn't obvious, ask with `/ask-costar`.
2. **Vexcel.**
   1. Download the tutorial bundle (PDF plus Python quickstart) from the Resources section of the hackathon site.
   2. Set `VEXCEL_API_KEY` and run the quickstart for one Houston lat/lon.
   3. Save one response of each kind into `data/private/samples/`: property attributes, ortho image clipped to the parcel, oblique image.
   4. List which attributes come back. You are looking for: parcel or building footprint, anything about neighboring structures, elevation or flood-related fields.
   5. Try the tutorial's "detecting custom elements" and "semantic search" calls once; note whether they work. They are stretch material for the agent.
3. **Matterport.**
   1. Run the first query from the hackathon site:
      ```
      curl -u "$MP_API_KEY:$MP_API_TOKEN" -H 'Content-Type: application/json' \
        https://api.matterport.com/api/models/graph \
        -d '{"query":"{ models(query: \"*\") { totalResults results { id name address { address } } } }"}'
      ```
   2. In the Model Playground on the hackathon site, search spaces by address and on the map.
   3. Look for warehouse, industrial, or large commercial spaces in Houston or LA that also appear in the CoStar extract.
   4. For one, query floors, rooms, and dimensions. Save the response.
4. **Pick the demo parcels** with Marvin and AJ: 2–3 per city. Each must be in CoStar and return Vexcel imagery; at least one should have a Matterport scan; aim for one clear Houston "buy" and one clear LA "pass". Save IDs to `data/private/demo_parcels.json`.
5. **Post the report** in the team channel by 4 AM: fields that exist, fields that don't, the link key between layers, the demo parcel list. Allen updates the contract and mocks from it.

If no usable Matterport building exists, the parcel feature runs on CoStar plus Vexcel. That still meets "two of three layers".

### 4. First region file

Hand-enter `data/regions.json` for the six regions (Houston TX, Los Angeles CA, Northern Virginia, Phoenix AZ, Columbus OH, Atlanta GA) with rough values marked `sample`, matching the fields in step 5. This replaces Marvin's fixture so `/rank` has one source of truth.

## Phase 2 — Real data (9:00 AM → 1:00 PM)

### 5. Region dataset (`scripts/build_regions.py` writes `data/regions.json`)

| Field | Source | How |
|-------|--------|-----|
| `electricity_price_usd_per_kwh` | EIA API v2, retail sales, industrial sector, by state, latest month | script |
| `grid_co2_kg_per_kwh` | EPA eGRID subregion table | hand-enter six values with the data year |
| `water_stress` (score and label) | WRI Aqueduct | look up each metro on the Aqueduct map, hand-enter |
| `existing_data_centers`, crowding | Epoch AI frontier data centers CSV (CC-BY; credit it) or PNNL's data center atlas | count per region |
| `time_to_power_years` | a cited grid-interconnection source, or mark `assumed` | hand-enter |

1. Every value carries `kind` and `source_id`. From a source is `reported`; a guess is `assumed`.
2. `data/sources.json`: one entry per source with title, publisher, URL, year.
3. Public CSVs may be committed under `data/public/` with attribution. Sponsor data may not.
4. Tell Allen and Marvin when the real file lands; rankings will shift.

### 6. Sponsor data clients

1. `datasources/parcels.py` and `costar.py`.
   1. At import, load only the demo parcels from the extract into a dict keyed by `parcel_id`.
   2. Normalize to the contract's `costar` block. Missing values stay `None`.
2. `datasources/vexcel.py`.
   1. `get_attributes` and `get_image_bytes` use the calls from the quickstart, with `httpx`, a 10-second timeout, and a disk cache in `data/private/cache/` keyed by parcel and call.
   2. Derive `homes_distance_m` and the flood or terrain flag from attributes that actually exist. If Vexcel doesn't provide one, return `None` so Marvin's check becomes `unknown`.
   3. Fallback for distance to homes: OpenStreetMap residential land use or buildings near the lat/lon via the Overpass API. Tag it `source_id: "osm"`.
3. `datasources/matterport.py`: `get_summary` via the GraphQL API with basic auth; floor area and room count; cached; `None` when the parcel has no scan.
4. `scripts/warm_cache.py`: calls every function for every demo parcel so the demo never waits on a sponsor API. Allen runs it on the server.
5. Announce each function in the channel as it becomes real: "vexcel.get_attributes is live; fields: …".

Done when (Gate B): Allen's parcel routes return real CoStar and Vexcel data for both demo parcels.

## Phase 3 — History, search, domain (1:00 → 6:00 PM)

### 7. Real time series for Tiger Data (no invented telemetry)

Allen creates the `metric_history` table and gives you `insert_metrics(rows)`.

1. `scripts/load_eia_history.py`: 36 months of monthly industrial electricity prices per state from EIA, inserted as `electricity_price` rows, `kind: reported`.
2. `scripts/backfill_scores.py`: for each month, run Marvin's `rank()` with that month's prices for the standard 100 MW case; insert `score`, `rank`, and `breakeven_launch_cost` rows, `kind: modeled`.
3. `scripts/refresh.py` with `run()`: pull the newest EIA month, recompute, insert. Hold the most recent real month out of the initial load so that calling refresh during the demo produces a real change.
4. Check the result with one query: scores per region per month look sane, no gaps.

### 8. Web search for the agent

1. `datasources/search.py: web_search(query)`. Decide with Marvin between a search API (needs a key) and Gemini's built-in search grounding. Use whichever works within 20 minutes.
2. Return title, URL, and snippet only. The agent must cite the URL.

### 9. Domain (GoDaddy Registry prize)

1. Read the MLH prize page for which domain endings qualify and how to redeem the code. Do this before choosing a name.
2. Register the domain by 6 PM.
3. Give AJ the domain for the frontend host and create the DNS records that host asks for. Give Allen `api.<domain>` pointed at the Vultr IP. DNS takes time; finish by 7 PM.
4. Screenshot the working site on the domain for the prize entry.

Done when (Gate C): history is loaded and one refresh produces a visible change.

## Phase 4 — Documents (6:00 → 11:00 PM)

1. `README.md`.
   1. What it is, who it's for, one screenshot.
   2. How to run it locally (exact commands from Allen's Makefile).
   3. Architecture in ten lines (from Allen's `docs/architecture.md`).
   4. **Attribution list:** every framework, library, and dataset with a link. Ask each teammate for theirs. This is a rules requirement.
   5. What we built this weekend versus what we used.
   6. Limitations: screening tool, modeled numbers, linear orbit model, parcels in two cities only.
2. `docs/assumptions.md` with Marvin: every constant, value, unit, source, `kind`.
3. `docs/data-sources.md`: each source, what we take from it, its license or terms. State that sponsor data is not in the repo.
4. `docs/costar.md`: which layers are used, where they are combined, what the agent does with them. Describe what works at Gate C, not the plan.
5. `docs/amazon.md`: target user, use case, how the agent reasons, plans, acts, and adapts (the re-investigation that fills "what changed").
6. `docs/peri.md` only if someone got a real consult (business, name, role, evidence).
7. If AJ is behind, take a page from `03-aj-frontend-2.md` instead of polishing docs. Ask him which.

## Phase 5 — Submission (Sat 11 PM → Sun 7:30 AM)

1. Devpost draft, saved by 3 AM; AJ reviews and submits by 7:30.
   1. Business & Enterprise as the only main track.
   2. Tick a sponsor track only if its feature works on the public URL.
   3. All four members and their Discord usernames.
   4. Public GitHub link, checked in a private window.
   5. Sections: problem, what it does, how we built it, what's real versus simplified, attributions, what's next.
2. Record the video with AJ (under 2 minutes), upload as unlisted.
3. Confirm with Allen that nothing under `data/private/` is in git history.
4. Six screenshots for Devpost: home, results, slider moved, region detail, parcel verdict with report, watchlist.

## If you're blocked

- Keys not arrived: build the region dataset first; it needs only EIA and hand-entered values.
- EIA key not arrived: download the price table from the EIA website by hand and mark it `reported`.
- A sponsor API is rate-limited or down: everything demo-critical should already be in the disk cache; if not, use the saved samples and tag them `sample`.
- Idle: README and attributions.
