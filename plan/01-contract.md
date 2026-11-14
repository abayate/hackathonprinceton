# 01 — Shared contract

This is a proposal for the kickoff. Change it together, then freeze it. After the freeze, nobody renames a field without telling the channel.

Every shape below is saved as a file in `/mocks`. Frontend builds against the mock. Backend first serves the mock file, then replaces it with real output field by field.

All money is USD. All field names are snake_case. Unknown values are `null`, never `0`.

## Common pieces

```jsonc
// a number with provenance
{ "value": 113880, "unit": "MWh/yr", "kind": "modeled", "source_id": null }
// kind: "reported" | "modeled" | "assumed" | "sample"
```

```jsonc
// assumptions the user can change (sliders). Sent with every model request.
{
  "electricity_price_multiplier": 1.0,   // scales each region's price
  "pue": null,                            // null = use region/design default
  "wue_l_per_kwh": null,
  "launch_cost_usd_per_kg": 2500,
  "hardware_life_years": 5,
  "analysis_years": 10,
  "discount_rate": 0.08
}
```

## 1. `POST /rank` — search results

Request (`mocks/rank.request.json`):

```json
{
  "it_power_mw": 100,
  "ready_by_year": 2029,
  "priority": "lowest_cost",
  "assumptions": { "launch_cost_usd_per_kg": 2500 }
}
```

`priority` is one of `lowest_cost`, `fastest`, `lowest_community_impact`, `balanced`. It maps to weights on the backend.

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
      "total_cost_usd": { "value": 0, "unit": "USD", "kind": "modeled" },
      "cost_per_mw_year_usd": { "value": 0, "unit": "USD/MW-yr", "kind": "modeled" },
      "time_to_power_years": { "value": 0, "unit": "yr", "kind": "assumed" },
      "risk": { "water": 0, "grid": 0, "crowding": 0, "overall": 0 },
      "reason": "Cheap power, but a long grid wait.",
      "badges": ["Lowest cost"],
      "has_parcels": true,
      "meets_deadline": true
    },
    {
      "rank": 7,
      "option_id": "leo",
      "name": "Low Earth Orbit",
      "type": "orbit",
      "lat": null, "lon": null,
      "score": 31,
      "reason": "No water or grid use, but launch cost dominates.",
      "badges": ["Zero water"],
      "has_parcels": false,
      "meets_deadline": false
    }
  ],
  "break_even": {
    "versus_option_id": "houston-tx",
    "launch_cost_usd_per_kg": 0,
    "sentence": "Orbit beats Houston when launch falls below $X per kg."
  }
}
```

The numbers above are placeholders. Orbit results carry the same cost and score fields as regions (omitted here for length).

## 2. `POST /options/{option_id}/breakdown` — region or orbit detail

Request: same body as `/rank`.

Response (`mocks/breakdown.response.json`):

```json
{
  "option_id": "houston-tx",
  "designs": [
    {
      "design_id": "evaporative",
      "label": "Water-cooled",
      "facility_power_mw": {},
      "annual_energy_mwh": {},
      "annual_water_liters": {},
      "annual_water_gallons": {},
      "annual_co2_tonnes": {},
      "capex_usd": {},
      "annual_opex_usd": {},
      "total_cost_usd": {},
      "homes_equivalent_water": {}
    },
    { "design_id": "dry", "label": "Dry-cooled" }
  ],
  "orbit": {
    "solar_area_m2": {}, "radiator_area_m2": {}, "launch_mass_kg": {},
    "launch_cost_usd": {}, "replacements": {}, "total_cost_usd": {},
    "warnings": ["Linear extrapolation, not an engineering design."]
  },
  "context": {
    "electricity_price_usd_per_kwh": {},
    "water_stress": { "value": 0, "label": "High", "kind": "reported", "source_id": "wri-aqueduct" },
    "grid_co2_kg_per_kwh": {},
    "existing_data_centers": {}
  },
  "warnings": [],
  "sources": [ { "source_id": "eia", "title": "", "url": "", "year": 2026 } ]
}
```

Each `{}` is a number-with-provenance object. `orbit` is `null` for regions unless requested; for `option_id: "leo"`, `designs` is empty and `orbit` is filled.

## 3. `GET /regions/{option_id}/parcels` — parcel listings (Houston, LA only)

```json
{
  "parcels": [
    {
      "parcel_id": "hou-001",
      "address": "",
      "lat": 0, "lon": 0,
      "kind": "land",
      "acres": 0,
      "asking_price_usd": null,
      "thumbnail_url": "/parcels/hou-001/image?size=thumb",
      "verdict": "buy",
      "verdict_reason": "Large enough, low flood flag, 1.2 mi from homes."
    }
  ]
}
```

`kind`: `land` or `building`. `verdict`: `buy`, `maybe`, `pass`.

## 4. `POST /parcels/{parcel_id}/verdict` — parcel detail

Request: same body as `/rank`.

```json
{
  "parcel_id": "hou-001",
  "verdict": "buy",
  "max_price_usd_per_acre": { "value": 0, "unit": "USD/acre", "kind": "modeled" },
  "sentence": "Worth buying up to $X per acre. Above that, the next-best site is the better deal.",
  "checks": [
    { "check": "size", "status": "pass", "detail": "42 acres, need about 30", "kind": "reported", "source": "costar" },
    { "check": "homes_distance", "status": "pass", "detail": "", "kind": "reported", "source": "vexcel" },
    { "check": "flood_terrain", "status": "warn", "detail": "", "kind": "reported", "source": "vexcel" },
    { "check": "water_stress", "status": "warn", "detail": "", "kind": "reported", "source": "wri-aqueduct" },
    { "check": "price", "status": "pass", "detail": "", "kind": "reported", "source": "costar" }
  ],
  "costar": { "property_type": "", "building_sf": null, "land_acres": 0, "last_sale_price_usd": null, "vacancy": null },
  "vexcel": { "ortho_image_url": "/parcels/hou-001/image", "oblique_image_url": null, "attributes": {} },
  "matterport": { "model_id": null, "floor_area_sf": null }
}
```

`status`: `pass`, `warn`, `fail`, `unknown`. Images are proxied through our API so keys never reach the browser.

## 5. Agent — `POST /parcels/{parcel_id}/investigate`, `GET /runs/{run_id}`

Start returns `{ "run_id": "run_123" }`. Poll `GET /runs/{run_id}` every 2 seconds.

```json
{
  "run_id": "run_123",
  "parcel_id": "hou-001",
  "status": "running",
  "started_at": "2026-11-14T15:00:00Z",
  "steps": [
    { "n": 1, "agent": "lead", "action": "plan", "summary": "Wrote a 4-item plan", "status": "done" },
    { "n": 2, "agent": "land", "action": "tool:get_costar_record", "summary": "42 acres, industrial", "status": "done" },
    { "n": 3, "agent": "land", "action": "tool:get_vexcel_attributes", "summary": "", "status": "running" }
  ],
  "report": null
}
```

When `status` is `done`, `report` is:

```json
{
  "generated_at": "",
  "live": true,
  "verdict": "buy",
  "summary": "",
  "sections": [
    { "id": "land", "title": "Land and building", "body_md": "", "source_ids": ["costar", "vexcel"] },
    { "id": "power", "title": "Power and grid", "body_md": "", "source_ids": [] },
    { "id": "water", "title": "Water", "body_md": "", "source_ids": [] },
    { "id": "community", "title": "Community and opposition", "body_md": "", "source_ids": [] }
  ],
  "open_questions": ["Utility has not confirmed capacity at this substation."],
  "what_changed": ["Electricity price up 4% since the last report."],
  "sources": [ { "source_id": "", "title": "", "url": "" } ]
}
```

`live: false` means the report was pre-generated. The UI shows the generation time either way. `status` can also be `error` with an `error` string.

## 6. Watchlist — `GET /watchlist`, `POST /watchlist`, `DELETE /watchlist/{item_id}`

No login. The browser makes a random `client_id`, stores it in localStorage, and sends it as the `X-Client-Id` header.

`POST` body: `{ "kind": "region" | "parcel", "ref_id": "houston-tx" }`

`GET` response:

```json
{
  "items": [
    {
      "item_id": "w1", "kind": "region", "ref_id": "houston-tx", "name": "Houston, TX",
      "current": { "rank": 2, "score": 78, "verdict": null },
      "previous": { "rank": 1, "score": 82, "verdict": null },
      "changes": [
        { "at": "2026-11-14", "text": "Electricity price rose 6%. Rank moved from 1 to 2.", "kind": "reported" }
      ],
      "history": [ { "t": "2026-06-01", "score": 82 } ]
    }
  ]
}
```

## 7. `GET /health`

`{ "status": "ok", "model_version": "v1", "db": "ok" | "down", "gemini": "ok" | "down" }`

## Error rules

| Case | Response |
|------|----------|
| Bad input (negative MW, year in the past) | 422 with `{ "detail": "..." }` |
| Unknown id | 404 |
| A data source is down | 200 with the field `null` and a string in `warnings` |
| Agent or Gemini down | `/investigate` returns 503; rest of the app keeps working |
| Database down | `/rank` and `/breakdown` still work; `/watchlist` returns 503 |

## Sign-off

- [ ] AJ  - [ ] Marvin  - [ ] Noah  - [ ] Allen

Contract owner after freeze: Allen. Changes go through him and get posted in the team channel. Noah reports the real sponsor data fields by 4 AM Saturday; Allen updates sections 3 and 4 from that report.
