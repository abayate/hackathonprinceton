# Next Steps

Build plan from Saturday 1:30 AM to the **8:00 AM Sunday** deadline. Tracks and how we use each sponsor are in [TRACKS.md](TRACKS.md).

## Stack

- **Web app:** Next.js 15 in `web/` (Tailwind, MapLibre). Server components read Tiger Data directly; no separate backend yet
- **Agent:** LangChain deepagents on Gemini (not built yet)
- **Database:** Tiger Data. Ours: `tx_projects`, `tx_project_features`, `risk_scores` (hypertable), `site_watchlist`. Team's: `parcels`, `regions`, `electricity_prices`, `score_history`, `reports`, `watchlist`
- **Hosting:** Vultr (not set up yet), GoDaddy domain pointed at it

## ✅ Done: the web app (run it: `cd web && npm run dev`, open http://localhost:3000)

- **Search page:** listing cards and map pins colored Green / Watch / Red, with filters for status, risk band, max water stress, free text and your MW load. Each card shows chance blocked or delayed, water stress and expected delay cost.
- **Site page:** headline "Expected X months of delay · $Y expected delay cost", the seven checks (each expandable with its rule and source links), a cost box at any MW (build cost, power per year, lease revenue, expected delay cost, each tagged reported / modeled / assumed), score history from the hypertable, "similar sites nearby with lower risk" via PostGIS, and a "What happened" box with the source for stopped projects.
- **Watchlist:** hearts on every card and site page, saved to Tiger (`site_watchlist`, per browser cookie). The watchlist page is also the side-by-side compare view.
- **Risk bands:** Green < 40%, Watch 40–60%, Red ≥ 60%. These thresholds are our choice, and the app says so.

## ✅ Done: real labels, features, model, demo project

Rebuild everything in order: `build_tx_projects.py` → `build_features.py` → `add_water_stress.py` → `train_risk_model.py` → `load_projects_tiger.py` (all in `scripts/`).

**Water stress** (WRI Aqueduct 4.0) is now on all 349 projects and drives the Water check. We tried it as a model feature and took it out: it came out with a negative sign (built West Texas campuses sit in high-stress basins), which is geography, not cause, and it pushed San Marcos to Green.

1. **Labels** ([data/labels/tx_projects.csv](data/labels/tx_projects.csv)): 349 Texas projects with coordinates. There are 21 stopped (17 usable; 4 excluded as business decisions, a bankruptcy, or a city-wide rule), 226 built and 102 proposed. Each row has its primary source link, and stopped rows have a stop date (15 of 21).
2. **Features** ([data/features/tx_project_features.csv](data/features/tx_project_features.csv)): Census geocoder for county, inside city limits and urban area; county population density; distance to the nearest metro; crypto or not; data centers already in the county. 10 rows have coordinates far from their named county and are flagged `location_reliable = no`.
3. **Model** ([data/model/risk_model.json](data/model/risk_model.json)): class-weighted logistic regression, cross-validated.

   | Comparison | Projects | ROC AUC | Stopped recall @0.5 |
   | --- | --- | --- | --- |
   | Stopped vs under construction (default) | 16 vs 86 | 0.70 ± 0.15 | 0.70 |
   | Stopped vs all built | 16 vs 217 | 0.78 ± 0.13 | 0.74 |

   Features: inside city limits, inside an urban area, county density, distance to nearest metro, crypto or not, data centers already in the county.

   Risk is higher **far from big metros** and in **counties with few existing data centers**, and lower for crypto mines. Small sample: say "early signal", not "proven".
4. **Tiger Data**: new tables `tx_projects` (PostGIS point), `tx_project_features`, and `risk_scores` (a **hypertable**, one row per project per scoring run). Existing team tables untouched.
5. **Demo project: San Marcos** (Highlander SM One, $1.5B, 200 acres on Francis Harris Lane next to the Hays Energy plant). Council denied it 5–2 at 2:14 AM on Feb 18, 2026, with 182 speakers signed up, over water and drought. An earlier zoning vote failed in summer 2025. Source: KUT.
   - Held-out model score (trained without it): **0.57**, riskiest 30% of recent projects. Location alone says **Watch**, not Red.

## ✅ Done: real listings with Vexcel, Matterport and CoStar

- **Listings are real CoStar properties:** 158 industrial, flex and land sites in Houston (121, scored) and LA (37, unscored because the model is Texas-only), with lot size, building size, clear height, heavy power, zoning and asking price where CoStar has it.
- **Every card shows a real Vexcel aerial** of the site; the listing page has a gallery (top-down plus four oblique angles).
- **3D city:** a Map / 3D toggle on the search page and a 3D section on each listing, streaming Vexcel 3D Tiles into CesiumJS through a server proxy (key never reaches the browser).
- **Matterport walkthrough** of the building on each listing (all 158 have a public scan).
- **Evidence page:** model metrics, what drives risk, all 21 stopped Texas projects with their sources, and a statewide map.

## What the brief asks for that is still missing

| Gap | Why it matters | Size |
| --- | --- | --- |
| **LLM pipeline over agendas, minutes and news** (the deepagent) | The brief's main differentiator; carries the Amazon, LangChain and Gemini entries; source of "what the neighbors are saying" | Big |
| **Dated signals and the rollback demo** | The model only uses static location features. The brief wants scores that change over time and a "roll back to the land purchase date" moment (San Marcos) | Medium, depends on the agent |
| **Watchlist alerts** | The brief's reason to come back: "risk raised from Watch to Red", by email or push | Medium |
| **Delay length is assumed** (12 months) | Expected delay cost = chance × 12 months × lease. The 12 has no source yet; find one or derive it from tracker dates | Small |
| **Power capacity, flood, labor** | Power uses CoStar's heavy-power flag only; no substation or interconnection data; no FEMA flood zone; no labor data | Medium |
| **LA risk model** | LA listings show "unscored" | Medium (needs California labels) |
| **Free community view** | Brief's free public layer | Small, lower priority |
| **Deployment** | Vultr + GoDaddy tracks; demo from a phone | Small |

## ▶ Next step: build the agent (biggest gap), then deploy

0. **Agent first:** an "Investigate" button on each listing starts a deepagent on Gemini. Subagents: `land` (CoStar record + Gemini vision on the Vexcel aerial: open land, nearby homes, substations), `power_water` (heavy power, EIA price, water stress, model numbers from Tiger), `community` (web search for hearings, moratoriums and opposition near the site, each finding with date + URL + quote). It writes a memo to `reports` and dated findings to `risk_signals`. Numbers come from the database, never from the LLM.
1. **Deploy to Vultr (≈30–45 min).** One Cloud Compute instance (Ubuntu), Node 20+, `git clone`, `cd web && npm ci && npm run build && npm start` behind Caddy for HTTPS. Set `DATABASE_URL` as an environment variable on the box (never commit it). In Tiger, allow the Vultr IP if the service restricts connections. This unlocks the Vultr track and lets you demo from a phone.
2. **Register the GoDaddy Registry domain** (MLH code) and point an A record at the Vultr IP. Caddy fetches the certificate by itself.
3. **Investigate button (the agent):** a deepagent on Gemini that, for one site, plans, pulls the record and features from Tiger, searches the web for opposition, hearings and moratoriums near it, and writes a memo with quoted, dated sources into `reports`. Numbers in the memo come from the database, not the LLM. This is the core of the Amazon, LangChain and Gemini entries.
4. **San Marcos rollback:** the agent's dated findings go into a `risk_signals` table (project_id, date, signal, source URL, quote). An "as of" date on the site page shows the band before and after each signal: Watch from location alone, then raised by the summer 2025 failed zoning vote and the Feb 17, 2026 county water-permit moratorium proposal. The rule that raises the band is our choice; label it that way.
5. **Houston parcels for the CoStar track:** score the team's `parcels` (CoStar + Vexcel) with the same features and show them as listings with their Vexcel aerial image.

Still missing: **distance to homes** statewide (OpenStreetMap was unreachable tonight; Vexcel covers the Houston/LA parcels), power capacity, and labor data. Those checks show "unknown" on purpose.

All data sources and their status are in [data/sources.csv](data/sources.csv).

## 0. Setup (now → 3 AM)

- [x] Repo fixed: one `main` branch with the plan, tracks, agent rules and `.gitignore`; CoStar kit and `.env` ignored
- [x] Data sources registry ([data/sources.csv](data/sources.csv)) and labeled Texas projects ([data/labels/tx_projects.csv](data/labels/tx_projects.csv))
- [x] Folders: `web/`, `scripts/`, `data/private/` (gitignored)
- [x] Next.js app reading Tiger Data
- [ ] Deploy to Vultr (see Next step)

## 1. Data, Houston first (3 → 9 AM)

- [ ] Load the CoStar kit into `parcels`: industrial, land and warehouse records in Houston and LA (5 rows today; aim for dozens)
- [ ] Cache a Vexcel aerial image per parcel in `data/private/`
- [ ] Find 1–2 Matterport scans of warehouses that are also in CoStar
- [ ] Load 36 months of EIA prices into the `electricity_prices` hypertable; hand-enter water stress per region
- [ ] Turn on PostGIS; compute distance to homes, schools and substations

## 2. Model (9 AM → noon)

- [ ] Plain, tested Python. No LLM produces numbers
- [ ] Seven checks, each pass / watch / fail
- [ ] P(blocked or delayed), expected months, and expected delay cost = P × months × ~$17M/month per 100 MW
- [ ] Build cost and yearly power cost
- [ ] Every number tagged `reported`, `modeled` or `assumed`
- [ ] Each score saved to `score_history`

## 3. API and frontend (noon → 6 PM, in parallel)

- [x] Search: listing cards on the left, map pins colored by risk, filters on top
- [x] Site page: the seven checks, cost box at any MW, score history, safer sites nearby
- [x] Watchlist doubling as compare: saved sites side by side
- [ ] Aerial photo on the site page: `/sites/{id}/image` proxy so the Vexcel key never reaches the browser
- [ ] Watchlist "what changed" feed (needs a second scoring run or new signals)

## 4. Agent (1 → 7 PM)

- [ ] Lead deepagent writes a plan, then delegates to three subagents:
  - `land`: CoStar record, Vexcel image (Gemini vision), Matterport scan
  - `power_water`: EIA prices, water stress, model functions
  - `community`: search for opposition, hearings and moratoriums
- [ ] Steps stream to the UI; the memo is saved to `reports`
- [ ] Scheduled monitor job on Vultr: new agenda or news item → rescore → alert in the watchlist

## 5. Tiger Data extras (5 → 8 PM)

- [ ] Continuous aggregates: monthly price by region, weekly risk by county
- [ ] pgvector over agenda and news chunks so the agent can search them and memos can quote sources
- [ ] "As of date" query for the rollback demo

## 6. Ship (8 → 11 PM)

- [ ] Register the GoDaddy domain; DNS and HTTPS on Vultr
- [ ] Full demo runs on a phone from the public URL

## 7. Freeze (11 PM → 7:30 AM)

- [ ] Bug fixes only
- [ ] Pre-generate memos for the demo sites, labeled "Saved" with their timestamps
- [ ] README: use case, target user, how to run, and every library and dataset credited (rules requirement)
- [ ] Devpost: Business and Enterprise as the main track, all special tracks and MLH prizes ticked, Discord usernames, video
- [ ] Rehearse the 2-minute demo five times
- [ ] Submitted by 7:30 AM. Hard stop 8:00 AM

## Demo (2 minutes, Houston)

1. Search 100 MW, no moratorium → pins and cards appear
2. Open a Houston site → aerial image, seven checks, "Expected X months · $Y delay cost"
3. Click Investigate → agent steps, then the memo
4. Open an LA site that fails → the reasons
5. Tap the heart, trigger an update → the alert appears
6. Close: "Visibility is free, decisions cost money."

## Open decisions

1. **Backtest:** real labels exist for Texas (21 stopped, 362 built), so no fake data is needed. Add the 170 national cancellations (T03) if 21 stopped examples is too few.
2. **Orbit comparison:** the database has an `orbit` region. Proposal: cut it to keep the pitch focused.
3. **Label source permissions:** More Than Just Parks hasn't confirmed reuse terms for its tracker. Ask them before publishing the labels file, or keep it out of the public repo.
