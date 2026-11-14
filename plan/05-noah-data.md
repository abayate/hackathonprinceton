# 05 — Noah: Data

You turn the sponsor data into the prospect list the whole product runs on, load the public data and history, build the Solana attestation, and own the domain, the docs, and the Devpost draft.

**Your folders:** `datasources/`, `attest/`, `scripts/`, `data/` (public files only), `docs/`, `README.md`. **Your branch:** `lane/data`.

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

## Your most time-critical task

The **sponsor data report, due 5 AM** (Phase 1, step 2). Marvin's verdict thresholds, AJ's prospect page, and Allen's contract all wait on it. Do it before anything else in Phase 1.

## What you hand over

Plain Python functions. Each returns dicts whose values carry `kind` and `source_id`, or `None` when the data doesn't exist. Push a stub that returns a `sample` first, so the others can import it, then fill in the real body. Once announced, a function's name and return fields don't change without telling the channel.

| Function | Returns | Used by |
|----------|---------|---------|
| `datasources.parcels.load_prospects()` | list of prospect records | Allen, Marvin |
| `datasources.regions.load_regions()` | list of region rows | Allen, Marvin |
| `datasources.regions.get_region_context(market_id)` | price, water stress, grid carbon, crowding | Agent |
| `datasources.costar.get_record(parcel_id)` | type, acres, building SF, prices, vacancy | Allen, agent |
| `datasources.vexcel.get_attributes(parcel_id)` | attributes, `homes_distance_m`, flood flag | Allen, agent |
| `datasources.vexcel.get_image_bytes(parcel_id, kind)` | ortho or oblique image bytes | Allen, agent |
| `datasources.matterport.get_summary(parcel_id)` | model ID, floor area, rooms, or `None` | Allen, agent |
| `datasources.search.web_search(query)` | title, URL, snippet | Agent |
| `scripts.refresh.run()` | loads the newest price month, recomputes | Allen |
| `attest.digest(memo)`, `attest_memo(memo)`, `verify_memo(memo, attestation)` | digest; attestation; verify result | Allen |

## What you depend on

| You need | From | Until it exists |
|----------|------|-----------------|
| Repo skeleton | Allen | Get keys meanwhile |
| `api.store.upsert_prospects`, `insert_metrics` | Allen | Write to local JSON files in `data/private/` |
| `model.prospect_list`, `model.rank` for backfills | Marvin | Load prices only; backfill scores later |

## Phase 0 — Keys (now → 2 AM)

Start these immediately; they don't need the repo.

1. In the CoStar track Discord, run `/costar-keys`. Accept the terms and enter the team name (use the name that will be on Devpost). You receive: the Matterport API key and token, the Matterport SDK key, the Vexcel key, and the download link and password for the CoStar extract.
2. Register for an EIA API key (free, by email).
3. Put every key in the team's private secrets under the names in `.env.example`.
4. Join the contract review. Watch the `costar`, `vexcel`, and `matterport` blocks; they are provisional until your report. Tick the sign-off.
5. After Allen pushes the skeleton: `git pull`, `git checkout -b lane/data`.
6. Create `datasources/__init__.py` and `parcels.py`, `regions.py`, `costar.py`, `vexcel.py`, `matterport.py`, `search.py`, each with stub functions returning `sample` data in the contract's shape. Pull request, merge.
7. Tell Allen your packages: `httpx`, `pandas`, later the Solana library.
8. Connect Claude Code to ChatOverflow.

## Phase 1 — Open the sponsor data (2 → 5 AM)

### 1. Look at each layer

1. **CoStar extract.**
   1. Download into `data/private/costar/`. It is a set of files, not an API.
   2. Open with pandas. Note the file format, the row count per city, and the column names for: address, lat/lon, property type, land area, building area, asking price, last sale price, vacancy or availability, zoning.
   3. Find what links a record to a Matterport space and to Vexcel coverage (a shared ID, or address). If unclear, ask with `/ask-costar` or in `#costar-group`.
2. **Vexcel.**
   1. Download the tutorial bundle (PDF plus Python quickstart) from the Resources section of the hackathon site.
   2. Set `VEXCEL_API_KEY`. Run the quickstart for one Houston lat/lon.
   3. Save one response of each kind in `data/private/samples/`: property attributes, ortho image clipped to the parcel, oblique image.
   4. List the attributes returned. Look for: parcel or building footprint, neighboring structures, elevation or flood fields.
   5. Try the tutorial's element-detection and semantic-search calls once and note whether they work.
3. **Matterport.**
   1. Run the first query from the hackathon site:
      ```
      curl -u "$MP_API_KEY:$MP_API_TOKEN" -H 'Content-Type: application/json' \
        https://api.matterport.com/api/models/graph \
        -d '{"query":"{ models(query: \"*\") { totalResults results { id name address { address } } } }"}'
      ```
   2. In the Model Playground, search spaces by address and on the map.
   3. Look for warehouse, industrial, or large commercial spaces in Houston or LA that are also in the CoStar extract.
   4. For one, query floors, rooms, and dimensions. Save the response.

### 2. The report (post in the team channel by 5 AM)

1. CoStar: the real column names for each field above, and which fields don't exist.
2. The link key between the three layers.
3. Vexcel: which attributes exist; whether distance to homes and a flood or terrain flag can be derived.
4. Matterport: whether any usable industrial or warehouse scan exists.
5. **How many prospects per city** pass the filter in step 3 below, by property type, and how many have a price.
6. Answers from the CoStar team to the questions in `07-costar-track.md`, including whether their imagery may appear in screenshots and the video.

Allen updates the contract and mocks from this.

### 3. Build the prospect list (`datasources/parcels.py`)

1. From the extract, keep records that could plausibly host a data center: land, industrial, flex, warehouse, and large vacant commercial, in Houston and Los Angeles.
2. Drop records with no location or no size. Keep a missing price as `None`.
3. Aim for a few dozen to a few hundred per city.
4. Normalize each to: `parcel_id`, `market_id` (`houston-tx` or `los-angeles-ca`), `address`, `lat`, `lon`, `kind` (`land` or `building`), `acres`, `asking_price_usd`, plus the `costar` block from the contract.
5. Compute the market median price per acre for each city (tag it `modeled`, source `costar`). Marvin uses it when a price is missing.
6. `load_prospects()` returns the list. Announce it with the count.

### 4. Demo prospects

With Marvin and AJ, pick 2–3 per city. Each must be in CoStar and return Vexcel imagery; at least one should have a Matterport scan. Aim for one clear Houston "buy" and one clear LA "pass". Save the IDs in `data/private/demo_parcels.json`.

### 5. First region file

Hand-enter `data/regions.json` for Houston TX, Los Angeles CA, Northern Virginia, Phoenix AZ, Columbus OH, and Atlanta GA with rough values marked `sample`, using the fields in Phase 2 step 6. `load_regions()` reads it.

## Phase 2 — Real data (9 AM → 1 PM)

### 6. Region dataset (`scripts/build_regions.py` writes `data/regions.json`)

| Field | Source | How |
|-------|--------|-----|
| `electricity_price_usd_per_kwh` | EIA API v2, retail sales, industrial sector, by state, latest month | Script |
| `grid_co2_kg_per_kwh` | EPA eGRID subregion table | Hand-enter six values with the data year |
| `water_stress` (score and label) | WRI Aqueduct | Look up each metro on the Aqueduct map; hand-enter |
| `existing_data_centers` (crowding) | Epoch AI frontier data centers CSV (CC-BY; credit it) or PNNL's atlas | Count per region |
| `time_to_power_years` | A cited grid-interconnection source, or mark `assumed` | Hand-enter |
| `median_land_usd_per_acre` | CoStar extract for Houston and LA; `assumed` elsewhere | Step 3 |

1. Every value carries `kind` and `source_id`.
2. `data/sources.json`: one entry per source with title, publisher, URL, year.
3. Public CSVs may be committed under `data/public/` with attribution. Sponsor data may not.
4. Announce when the real file lands. Rankings will move.

### 7. Sponsor data clients

1. `datasources/costar.py`: `get_record(parcel_id)` from the loaded prospects.
2. `datasources/vexcel.py`:
   1. `get_attributes` and `get_image_bytes` use the calls from the quickstart, with `httpx`, a 10-second timeout, and a disk cache in `data/private/cache/` keyed by parcel and call.
   2. Derive `homes_distance_m` and the flood or terrain flag only from attributes that exist. If Vexcel doesn't provide one, return `None`.
   3. Fallback for distance to homes: OpenStreetMap residential land use near the lat/lon via the Overpass API. Tag it `source_id: "osm"`.
   4. Fetch only when a prospect is opened. Never call Vexcel for every listing.
3. `datasources/matterport.py`: `get_summary` via the GraphQL API with basic auth; floor area and room count; cached; `None` when there is no scan.
4. `scripts/warm_cache.py`: calls every function for every demo prospect and for the listing's thumbnails, so the demo never waits on a sponsor API.
5. Announce each function as it becomes real, with its fields.

Done when (Gate B): Allen's routes return real CoStar and Vexcel data for both demo prospects.

## Phase 3 — MongoDB load, history, search, domain (1 → 6 PM)

### 8. Prospects into MongoDB

`scripts/load_prospects.py`: `api.store.upsert_prospects(load_prospects())`. Run it locally, and tell Allen to run it on the server.

### 9. Real time series for Tiger Data

No invented telemetry. Allen creates `metric_history` and gives you `insert_metrics(rows)`.

1. `scripts/load_eia_history.py`: 36 months of monthly industrial electricity prices per state, as `electricity_price` rows, `kind: reported`, with `ref_id` set to the market ID.
2. `scripts/backfill_scores.py`: for each month, run Marvin's functions with that month's prices for the standard 100 MW search. Insert `score` and `max_price_usd_per_acre` rows for the demo prospects and `score` and `rank` rows for the markets, `kind: modeled`.
3. `scripts/refresh.py` with `run()`: load the newest EIA month and recompute. Hold the most recent real month out of the first load, so running refresh during the demo produces a real change.
4. Check: one query per demo prospect shows a sensible monthly series with no gaps.

### 10. Web search for the agent

`datasources/search.py: web_search(query)`. Decide with Marvin between a search API (needs a key) and Gemini's built-in search grounding; use whichever works within 20 minutes. Return title, URL, and snippet only.

### 11. Domain (GoDaddy Registry)

1. Read the MLH prize page for which domain endings qualify and how to redeem the code, before choosing a name.
2. Register the domain by 6 PM.
3. Give AJ the domain and create the DNS records his frontend host asks for. Point `api.<domain>` at Allen's Vultr IP. Finish by 7 PM; DNS takes time.
4. Screenshot the working site on the domain.

Done when (Gate C): prospects are in MongoDB, history is loaded, and one refresh produces a visible change.

## Phase 4 — Solana, then documents (6 → 11 PM)

### 12. Attestation (`attest/`)

1. Setup: install the Solana Python library and read its docs for the installed version; the client and transaction APIs differ between versions. Create a devnet keypair outside the repo. Fund it from the devnet airdrop or faucet.
2. `canonical_bytes(memo)`: JSON with sorted keys, no extra whitespace, UTF-8, leaving out the `attestation`, `digest_sha256`, and `live` fields.
3. `digest(memo)`: SHA-256 hex of those bytes.
4. `attest_memo(memo)`: send a devnet transaction whose memo instruction carries only the memo ID and the digest. Wait for confirmation. Return `status`, `digest_sha256`, `signature`, `explorer_url`, `network`. No address, price, or company data goes on chain.
5. `verify_memo(memo, attestation)`: recompute the digest, fetch the transaction by signature, read the digest from it, compare all three. Return `verified`, `mismatch`, `not_attested`, or `unavailable`.
6. Any RPC failure returns `unavailable`. Nothing defaults to success.
7. Tests: same memo with shuffled key order gives the same digest; an unchanged memo verifies; one changed character gives `mismatch`; a bad RPC URL gives `unavailable`.
8. Tell Allen when it's ready; he exposes the two routes.

### 13. MLH tracks

1. Read each MLH prize page and write its exact requirements in `docs/mlh.md`: Gemini, MongoDB Atlas, Tiger Data, Solana, Vultr, GoDaddy Registry, DEV.
2. For each, keep one screenshot or log in `docs/mlh/` showing the feature working. No keys, no sponsor data.
3. SpaceXSI is not entered; it requires Cursor as the main coding agent.

### 14. Documents

1. `README.md` (a draft exists at the repo root): fill every TODO.
   1. How to run locally, from Allen's Makefile.
   2. Architecture, from Allen's `docs/architecture.md`.
   3. **Attribution list:** every framework, library, and dataset, with links. Ask each teammate. This is a rules requirement.
   4. What we built this weekend versus what we used.
   5. Remove every feature that doesn't work on the live site.
2. `docs/assumptions.md` with Marvin: every constant, value, unit, source, `kind`.
3. `docs/data-sources.md`: each source, what we take from it, its license. State that sponsor data is not in the repo.
4. `docs/costar.md`: layers used, where they are combined, what the agent does with them. Describe what works.
5. `docs/amazon.md`: target user, use case, how the agent reasons, plans, acts, and adapts.
6. If AJ is behind, take a page from `02-aj-frontend.md` before polishing documents. Ask him which.

## Phase 5 and 6 — Submission (Sat 11 PM → Sun 7:30 AM)

1. Devpost draft, saved by 3 AM. AJ reviews and submits by 7:30.
   1. Business & Enterprise as the only main track.
   2. Tick a sponsor or MLH track only if its feature works on the public URL.
   3. All four members and their Discord usernames.
   4. Public GitHub link, checked in a private window.
   5. Sections: problem, what it does, how we built it, what's real versus simplified, attributions, what's next.
2. DEV post: check its deadline and required tags on the MLH page. Write it from the README: problem, architecture, the model, the agent, what was hard, limitations.
3. Record the video with AJ (under 2 minutes), upload as unlisted. Only include sponsor imagery if the CoStar team said yes.
4. Six screenshots: home, listings, prospect verdict, memo with Solana badge, markets with the slider moved, watchlist.
5. Confirm with Allen that nothing under `data/private/` is in git history.

## If you're blocked

- Sponsor keys not arrived: build the region dataset; it needs only EIA and hand-entered values.
- EIA key not arrived: download the price table from the EIA website by hand; mark it `reported`.
- A sponsor API is rate-limited or down: demo data should already be in the disk cache; otherwise use saved samples tagged `sample`.
- Solana airdrop fails: try the web faucet; if still stuck after 30 minutes, ship `digest()` only, return `unavailable` from attest, and drop the Solana entry.
- Idle: README and attributions.
