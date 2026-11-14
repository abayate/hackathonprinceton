# AGENTS.md

## Project

HackPrinceton project: a data center siting and risk platform. Users browse possible US AI data center sites like Airbnb listings and see, in months of delay and dollars, whether each one will get built.

The full spec is in `Data Center Siting & Risk Platform — Project Brief.md`. Read it for product, model and design questions.

## Hard rules

- **Never edit, rename, move or reformat the project brief** (`Data Center Siting & Risk Platform — Project Brief.md`). Read it only. If it looks wrong or out of date, say so in chat.
- **No git writes.** Don't run `git add`, `commit`, `push` or anything else that changes history. When work is ready, tell Noah to commit and list the paths.

## Weekend scope (from the brief)

Build a narrow, real slice, not the whole product:

1. 1–2 states with good public data and several stopped projects
2. Site dataset with labels (stopped vs. built)
3. LLM pipeline that tags county agendas, minutes and local news (e.g. "moratorium proposed")
4. Simple classifier (logistic regression or gradient boosting) predicting blocked/delayed, backtested on held-out projects
5. Front end: search page (map + listing cards + filters), site listing page, compare, watchlist with alerts

## Model conventions

- Output is expected delay (months) and expected cost (dollars), not 1–10 scores. Expected delay cost = P(blocked/delayed) × typical delay × monthly cost (~$170/kW/month lease; ~$17M/month for 100 MW).
- Seven checks per site, each pass / watch / fail: power, water, zoning and permits, community opposition, policy and incentives, land and physical risk, labor and construction.
- No leakage: train only on information available before each project's decision date.
- Every score links to its sources (filings, agendas, datasets).
- Say "blocked or delayed", not "cancelled", for tracker totals.

## Stack

- **Web app:** `web/`, Next.js 15 (App Router, TypeScript, Tailwind v4, MapLibre). Server components query Tiger Data directly with `pg`; the only API route is `/api/watchlist`. Run: `cd web && npm run dev`. Reads `DATABASE_URL` from the environment or the repo-root `.env`.
- **Data and model:** Python scripts in `scripts/`, run in order: `build_tx_projects.py` → `build_features.py` → `add_water_stress.py` → `train_risk_model.py` → `load_projects_tiger.py` → `build_sites.py` (listings from the CoStar kit).
- **Database:** Tiger Data (Postgres + TimescaleDB + PostGIS). Our tables: `sites` (158 CoStar listings in Houston/LA), `tx_projects`, `tx_project_features`, `risk_scores` (hypertable), `site_watchlist`. Team tables (`parcels`, `regions`, `electricity_prices`, `score_history`, `reports`, `watchlist`) are not ours; don't alter them.
- **Sponsor data:** CoStar, Vexcel and Matterport data never go in git. `build_sites.py` writes only to Tiger; Vexcel images are cached in `data/private/cache/vexcel/`. The Vexcel key stays server-side: the browser only talks to `/api/vexcel/image/[siteId]` and `/api/vexcel/3d/[tileset|tile]`.
- **Vexcel coverage:** the hackathon key covers Houston and LA only (other places return 403).
- **Constants:** every cost or rate in `web/lib/model.ts` names its source ID from `data/sources.csv` and is tagged reported, modeled or assumed.

### Verified public-mode commands

- Public demo from the repository root: `cd web && DATA_MODE=public npm run dev` (then open `http://localhost:3000`). It reads the checked-in public project data and keeps watchlist/intake sessions in process memory; this does not verify database mode.
- Public-mode HTTP smoke from `web/`: `npm run smoke`. It builds and starts the production app on a free loopback port, checks public routes and watchlist replay, verifies disabled routes remain closed, and stops its server without database or sponsor credentials.
- Web checks from `web/`: `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
