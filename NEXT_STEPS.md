# Next Steps

Build plan from Saturday 1:30 AM to the **8:00 AM Sunday** deadline. Tracks and how we use each sponsor are in [TRACKS.md](TRACKS.md).

## Stack

- **Frontend:** Next.js, Tailwind, MapLibre
- **Backend:** FastAPI (Python)
- **Agent:** LangChain deepagents on Gemini
- **Database:** Tiger Data only. Already has `parcels`, `regions`, `electricity_prices`, `score_history`, `reports`, `watchlist`
- **Hosting:** everything on Vultr (Docker Compose, with Caddy for HTTPS), GoDaddy domain pointed at it

## 0. Setup (now → 3 AM)

- [ ] Repo fixed: one `main` branch with the plan, tracks, agent rules and `.gitignore`; CoStar kit and `.env` ignored
- [ ] Folders: `web/`, `api/`, `agent/`, `model/`, `scripts/`, `data/private/` (gitignored), `.env.example`
- [ ] FastAPI `/health` checking the Tiger and Gemini connections; bare Next.js app
- [ ] Deploy "hello world" to Vultr now so hosting problems show up early

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

**API**
- [ ] `/sites` (search and filters) and `/sites/{id}` (full report)
- [ ] `/sites/{id}/image`: proxy so the Vexcel key never reaches the browser
- [ ] `/compare`
- [ ] `/watchlist` and `/history`

**Pages**
- [ ] Search: listing cards on the left, map pins colored by risk, filters on top
- [ ] Site page: aerial photo, the seven checks, cost box with sliders
- [ ] Compare: 2–4 sites side by side
- [ ] Watchlist: saved sites and what changed

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

1. **Backtest:** the brief's main credibility point, but it needs labeled stopped and built projects in TX and CA. Proposal: show the rollback on one real stopped project and list the full backtest as "next".
2. **Orbit comparison:** the database has an `orbit` region. Proposal: cut it to keep the pitch focused.
