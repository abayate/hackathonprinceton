# 01 — Shared contract

The JSON every lane builds against. Review it together at kickoff, fix names, tick the sign-off, then freeze. After the freeze only Allen edits it, and every change is posted in the team channel.

Each shape is saved as a file in `/mocks`. The frontend builds against the mock. The backend serves the mock first, then replaces it with real output.

## Conventions

- Money is USD. Field names are snake_case. A prospect and a parcel are the same record; the ID is `parcel_id`.
- Unknown values are `null`, never `0`.
- A number with provenance ("Num") looks like this, and every `{}` below is one:

```json
{ "value": 113880, "unit": "MWh/yr", "kind": "modeled", "source_id": null }
```

`kind` is `reported` (from a source), `modeled` (our formula), `assumed` (a constant we chose), or `sample` (hardcoded fallback).

- The search inputs appear in every model request as `workload` + `assumptions`:

```json
{
  "workload": { "it_power_mw": 100, "ready_by_year": 2029, "priority": "lowest_cost" },
  "assumptions": {
    "electricity_price_multiplier": 1.0,
    "pue": null,
    "wue_l_per_kwh": null,
    "launch_cost_usd_per_kg": 2500,
    "hardware_life_years": 5,
    "analysis_years": 10,
    "discount_rate": 0.08
  }
}
```

`priority`: `lowest_cost`, `fastest`, `lowest_community_impact`, `balanced`. Any assumption left out or `null` uses the default.

- The browser creates a random `client_id` once, keeps it in localStorage, and sends it as the `X-Client-Id` header on every call. There is no login.

## Endpoints

| # | Method and path | Purpose | Demo row |
|---|-----------------|---------|----------|
| 1 | `GET /health` | Service status | — |
| 2 | `POST /prospects` | Ranked land prospects (main results page) | 3 |
| 3 | `POST /parcels/{parcel_id}/verdict` | One prospect in full | 4, 6 |
| 4 | `GET /parcels/{parcel_id}/image` | Aerial image, proxied | 3, 4 |
| 5 | `POST /parcels/{parcel_id}/investigate` | Start an agent run | 5 |
| 6 | `GET /runs/{run_id}` | Agent steps and the memo | 5 |
| 7 | `POST /memos/{memo_id}/attest` | Record the memo hash on Solana devnet | 5 |
| 8 | `GET /memos/{memo_id}/verify` | Check the memo against the chain | 5 |
| 9 | `POST /rank` | Markets tab: regions plus orbit | 7 |
| 10 | `POST /options/{option_id}/breakdown` | One market or orbit in detail | 7 |
| 11 | `GET /watchlist`, `POST /watchlist`, `DELETE /watchlist/{item_id}` | Saved prospects and markets | 8 |
| 12 | `GET /history` | Chart points for a saved item | 8 |
| 13 | `POST /admin/refresh` | Load the newest data month (secret header) | 8 |

## 1. `GET /health`

```json
{ "status": "ok", "model_version": "v1", "mongo": "ok", "tiger": "ok", "gemini": "ok", "solana": "ok" }
```

Each service is `ok` or `down`.

## 2. `POST /prospects`

Request (`mocks/prospects.request.json`):

```json
{
  "workload": { "it_power_mw": 100, "ready_by_year": 2029, "priority": "lowest_cost" },
  "assumptions": {},
  "market": "all",
  "max_price_usd": null
}
```

`market`: `all`, `houston-tx`, or `los-angeles-ca`.

Response (`mocks/prospects.response.json`):

```json
{
  "request_id": "req_abc",
  "model_version": "v1",
  "count": 24,
  "prospects": [
    {
      "rank": 1,
      "parcel_id": "hou-001",
      "market_id": "houston-tx",
      "address": "",
      "lat": 0, "lon": 0,
      "kind": "land",
      "acres": 0,
      "asking_price_usd": null,
      "thumbnail_url": "/parcels/hou-001/image?size=thumb",
      "investment_score": 84,
      "verdict": "buy",
      "verdict_reason": "Large enough and priced below its ceiling.",
      "max_price_usd_per_acre": {},
      "ten_year_cost_usd": {},
      "fits_capacity": true,
      "checks_complete": false
    }
  ],
  "markets": [
    { "market_id": "houston-tx", "name": "Houston, TX", "prospect_count": 14,
      "electricity_price_usd_per_kwh": {}, "water_stress": { "value": 0, "label": "Medium", "kind": "reported", "source_id": "wri-aqueduct" } }
  ],
  "warnings": []
}
```

- `kind`: `land` or `building`. `verdict`: `buy`, `maybe`, `pass`.
- `checks_complete: false` means the listing verdict used CoStar and market data only. The aerial checks run when the prospect is opened.

## 3. `POST /parcels/{parcel_id}/verdict`

Request: `workload` + `assumptions`.

Response (`mocks/verdict.response.json`):

```json
{
  "parcel_id": "hou-001",
  "market_id": "houston-tx",
  "address": "",
  "lat": 0, "lon": 0,
  "kind": "land",
  "verdict": "buy",
  "sentence": "Worth buying up to $X per acre. Above that, the next-best site is the better deal.",
  "max_price_usd_per_acre": {},
  "checks_complete": true,
  "checks": [
    { "check": "size", "status": "pass", "detail": "42 acres, need about 30", "kind": "reported", "source_id": "costar" },
    { "check": "price", "status": "pass", "detail": "", "kind": "reported", "source_id": "costar" },
    { "check": "homes_distance", "status": "pass", "detail": "", "kind": "reported", "source_id": "vexcel" },
    { "check": "flood_terrain", "status": "warn", "detail": "", "kind": "reported", "source_id": "vexcel" },
    { "check": "water_stress", "status": "warn", "detail": "", "kind": "reported", "source_id": "wri-aqueduct" }
  ],
  "investment": {
    "investment_score": 84,
    "ten_year_cost_usd": {},
    "cost_per_mw_year_usd": {},
    "facility_power_mw": {},
    "annual_energy_mwh": {},
    "annual_water_gallons": {},
    "homes_equivalent_water": {},
    "next_best": { "parcel_id": "hou-004", "address": "", "ten_year_cost_usd": {} },
    "vs_orbit": { "launch_cost_usd_per_kg": null, "sentence": "Orbit beats this site when launch falls below $X per kg." }
  },
  "designs": [
    { "design_id": "evaporative", "label": "Water-cooled", "facility_power_mw": {}, "annual_energy_mwh": {},
      "annual_water_gallons": {}, "annual_co2_tonnes": {}, "capex_usd": {}, "annual_opex_usd": {}, "ten_year_cost_usd": {} },
    { "design_id": "dry", "label": "Dry-cooled" }
  ],
  "costar": { "property_type": "", "land_acres": 0, "building_sf": null, "asking_price_usd": null, "last_sale_price_usd": null, "vacancy": null },
  "vexcel": { "ortho_image_url": "/parcels/hou-001/image?kind=ortho", "oblique_image_url": null, "attributes": {} },
  "matterport": { "model_id": null, "floor_area_sf": null, "room_count": null },
  "latest_memo_id": null,
  "warnings": [],
  "sources": [ { "source_id": "costar", "title": "", "url": null, "year": 2026 } ]
}
```

- Check `status`: `pass`, `warn`, `fail`, `unknown`.
- The `costar`, `vexcel`, and `matterport` blocks are provisional until Noah reports the real fields. Any field in them may be `null`.

## 4. `GET /parcels/{parcel_id}/image`

Query: `kind=ortho|oblique` (default `ortho`), `size=thumb|full` (default `full`). Returns image bytes. Sponsor keys never reach the browser. Returns 404 if there is no image.

## 5. `POST /parcels/{parcel_id}/investigate`

Request: `workload` + `assumptions`. Response: `{ "run_id": "run_123" }`. If a run for this prospect is already in progress, the same `run_id` comes back. Returns 503 if the agent is unavailable.

## 6. `GET /runs/{run_id}`

Poll every 2 seconds. Mocks: `mocks/run.running.json`, `mocks/run.done.json`.

```json
{
  "run_id": "run_123",
  "parcel_id": "hou-001",
  "status": "running",
  "started_at": "2026-11-14T15:00:00Z",
  "finished_at": null,
  "error": null,
  "steps": [
    { "n": 1, "agent": "lead", "action": "plan", "layer": null, "summary": "Wrote a 4-item plan", "status": "done" },
    { "n": 2, "agent": "land", "action": "get_costar_record", "layer": "costar", "summary": "42 acres, industrial", "status": "done" },
    { "n": 3, "agent": "land", "action": "describe_aerial_image", "layer": "vexcel", "summary": "", "status": "running" }
  ],
  "memo": null
}
```

- `status`: `running`, `done`, `error`. Step `status`: `running`, `done`, `error`.
- `agent`: `lead`, `land`, `power_water`, `community`. `layer`: `costar`, `vexcel`, `matterport`, `model`, `web`, or `null`.

When `status` is `done`, `memo` is:

```json
{
  "memo_id": "memo_123",
  "parcel_id": "hou-001",
  "generated_at": "2026-11-14T15:02:10Z",
  "live": true,
  "recommendation": "buy",
  "max_price_usd_per_acre": {},
  "summary": "",
  "sections": [
    { "id": "land", "title": "Land and building", "body_md": "", "source_ids": ["costar", "vexcel"] },
    { "id": "power_water", "title": "Power and water", "body_md": "", "source_ids": [] },
    { "id": "community", "title": "Community and opposition", "body_md": "", "source_ids": [] }
  ],
  "deal_risks": ["Parcel is 200 m from homes."],
  "open_questions": ["Utility has not confirmed capacity at this location."],
  "what_changed": [],
  "sources": [ { "source_id": "", "title": "", "url": "" } ],
  "digest_sha256": "",
  "attestation": { "status": "not_attested", "signature": null, "explorer_url": null, "network": "devnet" }
}
```

`live: false` means the memo was loaded from storage, not just generated. The UI always shows `generated_at`.

## 7. `POST /memos/{memo_id}/attest`

```json
{ "memo_id": "memo_123", "status": "confirmed", "digest_sha256": "", "signature": "", "explorer_url": "", "network": "devnet" }
```

`status`: `pending`, `confirmed`, `failed`, `unavailable`. Attesting an already-confirmed memo returns the stored result.

## 8. `GET /memos/{memo_id}/verify`

```json
{ "memo_id": "memo_123", "status": "verified", "stored_digest": "", "recomputed_digest": "", "onchain_digest": "", "checked_at": "" }
```

`status`: `verified` (all three digests match), `mismatch`, `not_attested`, `unavailable` (chain could not be read). Never `verified` when the chain could not be read.

## 9. `POST /rank`

Request: `workload` + `assumptions`.

Response (`mocks/rank.response.json`):

```json
{
  "request_id": "req_abc",
  "model_version": "v1",
  "weights": { "cost": 0.6, "time": 0.2, "risk": 0.2 },
  "results": [
    {
      "rank": 1,
      "option_id": "houston-tx",
      "name": "Houston, TX",
      "type": "region",
      "lat": 29.76, "lon": -95.37,
      "score": 82,
      "ten_year_cost_usd": {},
      "cost_per_mw_year_usd": {},
      "time_to_power_years": {},
      "risk": { "water": 0, "grid": 0, "crowding": 0, "overall": 0 },
      "reason": "Cheap power, but a long grid wait.",
      "badges": ["Lowest cost"],
      "has_prospects": true,
      "meets_deadline": true
    }
  ],
  "break_even": {
    "versus_option_id": "houston-tx",
    "launch_cost_usd_per_kg": null,
    "sentence": "Orbit beats Houston when launch falls below $X per kg."
  }
}
```

`type`: `region` or `orbit`. The orbit result has `option_id: "leo"`, `lat` and `lon` `null`, and the same fields otherwise. `break_even.launch_cost_usd_per_kg` is `null` when orbit cannot win at any launch price.

## 10. `POST /options/{option_id}/breakdown`

Request: `workload` + `assumptions`.

Response (`mocks/breakdown.response.json`):

```json
{
  "option_id": "houston-tx",
  "name": "Houston, TX",
  "designs": [ { "design_id": "evaporative", "label": "Water-cooled", "facility_power_mw": {}, "annual_energy_mwh": {},
                 "annual_water_gallons": {}, "annual_co2_tonnes": {}, "capex_usd": {}, "annual_opex_usd": {}, "ten_year_cost_usd": {} } ],
  "orbit": null,
  "context": {
    "electricity_price_usd_per_kwh": {},
    "water_stress": { "value": 0, "label": "High", "kind": "reported", "source_id": "wri-aqueduct" },
    "grid_co2_kg_per_kwh": {},
    "existing_data_centers": {},
    "time_to_power_years": {}
  },
  "warnings": [],
  "sources": []
}
```

For `option_id: "leo"`, `designs` is empty and `orbit` is:

```json
{ "solar_area_m2": {}, "radiator_area_m2": {}, "launch_mass_kg": {}, "launch_cost_usd": {},
  "replacements": {}, "ten_year_cost_usd": {}, "time_to_power_years": {},
  "warnings": ["Linear extrapolation from a 1 MW module, not an engineering design."] }
```

## 11. Watchlist

`POST /watchlist` body: `{ "kind": "parcel", "ref_id": "hou-001" }`. `kind` is `parcel` or `market`. Returns the created item. `DELETE /watchlist/{item_id}` returns 204.

`GET /watchlist` (`mocks/watchlist.response.json`):

```json
{
  "items": [
    {
      "item_id": "w1", "kind": "parcel", "ref_id": "hou-001", "name": "",
      "current": { "verdict": "buy", "max_price_usd_per_acre": 0, "score": 78, "rank": null },
      "previous": { "verdict": "buy", "max_price_usd_per_acre": 0, "score": 82, "rank": null },
      "changes": [ { "at": "2026-11-14", "text": "Electricity price rose 6%. Max price fell from $X to $Y per acre.", "kind": "reported" } ]
    }
  ]
}
```

## 12. `GET /history`

Query: `ref_id`, `metric` (`electricity_price`, `score`, `max_price_usd_per_acre`, `rank`).

```json
{ "ref_id": "hou-001", "metric": "max_price_usd_per_acre", "unit": "USD/acre", "points": [ { "t": "2026-06-01", "value": 0 } ] }
```

## 13. `POST /admin/refresh`

Header `X-Admin-Secret`. Loads the newest electricity-price month and recomputes history. Response: `{ "status": "ok", "rows_inserted": 0 }`.

## Errors

| Case | Response |
|------|----------|
| Bad input (MW not positive, year in the past, unknown priority) | 422 with `{ "detail": "..." }` |
| Unknown ID | 404 |
| A data source is down | 200, affected fields `null`, a string in `warnings` |
| Agent or Gemini down | `/investigate` returns 503; everything else works |
| MongoDB down | watchlist, investigate, attest return 503; prospects, verdict, rank still work |
| Tiger Data down | `/history` returns 503; watchlist returns items with empty `changes` |
| Solana down | attest and verify return 200 with `status: "unavailable"` |

## Where data is stored

| Data | Store |
|------|-------|
| Prospects, agent runs, memos, watchlist, attestations | MongoDB Atlas |
| Electricity price, score, max price over time | Tiger Data, table `metric_history` |
| CoStar extract, cached Vexcel and Matterport responses | `data/private/` on disk, never in git |

## Mock files (Allen creates all of them at kickoff)

`prospects.request.json`, `prospects.response.json`, `verdict.response.json`, `run.running.json`, `run.done.json`, `attest.response.json`, `verify.response.json`, `rank.response.json`, `breakdown.response.json`, `breakdown.leo.response.json`, `watchlist.response.json`, `history.response.json`.

## Sign-off

- [ ] AJ  - [ ] Marvin  - [ ] Allen  - [ ] Noah
