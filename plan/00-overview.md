# 00 — Overview: scope, tracks, schedule, rules

Read this first. Then read `01-contract.md`, then your own lane file.

## The product

A listings-style site (think Apartments.com for data center sites) that tells a company where to build its next AI data center, which land to buy and for how much, and when orbit becomes the better option.

One main user: a data center developer or investor choosing a site.

## The demo (this table IS the scope)

If a feature is not in this table, nobody builds it until every row works end to end.

| # | Time | What the judge sees | What has to work | Owner |
|---|------|--------------------|------------------|-------|
| 1 | 0:00–0:15 | Spoken pitch: billions lost to badly chosen sites | Nothing | AJ |
| 2 | 0:15–0:30 | Search bar pre-filled "Large, ready by 2029, lowest cost". Hit search | Search form with presets | AJ |
| 3 | 0:30–0:50 | Region cards beside a map. "Low Earth Orbit" is a card near the bottom | `POST /rank` from the real model, 6 regions + orbit | AJ, Marvin, Allen |
| 4 | 0:50–1:05 | Drag launch-cost slider. Orbit card climbs. Line reads "Orbit beats Houston below $X/kg" | Live re-rank + break-even | AJ, Marvin |
| 5 | 1:05–1:20 | Click Houston: cost, power, cooling, water breakdown | Region detail page | AJ, Marvin |
| 6 | 1:20–1:40 | Open a Houston parcel: aerial image, "Buy up to $X/acre", reason. Agent report with its steps visible. Flip to an LA parcel: "Pass" | Parcel page: Vexcel image, CoStar price, verdict, agent report | AJ, Noah, Allen, Marvin |
| 7 | 1:40–1:50 | Tap heart. Watchlist shows "Power prices rose, your top pick changed" | Save + one "what changed" item | AJ, Allen, Noah |
| 8 | 1:50–2:00 | Who it's for, what's next | Nothing | AJ |

## Lanes

| Person | Lane | File |
|--------|------|------|
| AJ | Frontend, all of it. Part 1: search, ranking, sliders, orbit card, break-even. Also presents the pitch | `02-aj-frontend-1.md` |
| AJ | Frontend part 2: region detail, parcel page, agent report view, watchlist | `03-aj-frontend-2.md` |
| Marvin | Model + Agent: all formulas, scoring, break-even, verdict, then the deep agent | `04-marvin-model-agent.md` |
| Allen | Backend: repo, FastAPI routes, database, agent run plumbing, Vultr deploy, security | `05-allen-backend.md` |
| Noah | Data: sponsor data (CoStar, Vexcel, Matterport), public datasets, history loads, domain, README and Devpost draft | `06-noah-data.md` |
| Everyone | Git workflow | `07-git-workflow.md` |

AJ carries two files alone. If the frontend falls behind at any gate, Noah (whose load drops after Gate B) picks up part 2 pages.

## Stack

- Frontend: Next.js (App Router, TypeScript), Tailwind, MapLibre GL for the map, Recharts for charts.
- Backend: Python 3.11+, FastAPI, Pydantic v2.
- Model: plain Python functions in `model/`, no LLM, tested with pytest.
- Agent: LangChain `deepagents` with Gemini as the model.
- Database: Tiger Data (Postgres + TimescaleDB). One database only.
- Hosting: backend on Vultr, frontend on Vercel (or Vultr), GoDaddy Registry domain.

## Repo layout

```
/web            Next.js app            (AJ)
/api            FastAPI app            (Allen)
/datasources    data clients + loaders (Noah)
/scripts        data build + load scripts (Noah)
/model          formulas + tests       (Marvin)
/agent          deep agent + tools     (Marvin)
/mocks          example JSON per endpoint (everyone reads, contract owner edits)
/data           public CSVs only. NEVER CoStar/Vexcel/Matterport data
/docs           assumptions.md, sponsor notes
```

`/data/private/` is git-ignored. All CoStar extract files go there.

## Tracks we enter

| Track | What qualifies us | Owner |
|-------|-------------------|-------|
| Business & Enterprise (the one main track) | The whole product | AJ |
| Best Overall | Automatic. Note: a track winner cannot also win Overall | — |
| CoStar "Inside and Out" ($1,500) | Agent that combines at least two of CoStar, Vexcel, Matterport on a parcel. Judged 30% data use, 30% agentic depth, 25% usefulness, 15% demo | Marvin + Noah |
| Amazon Practical AI | The agent reasons, plans, acts, adapts; the watchlist is the "use it every day" story. Needs docs + clear target user | Marvin + AJ |
| LangChain deepagents | The site investigator is a deepagent | Marvin |
| MLH Gemini | Gemini is the agent's model | Marvin |
| MLH Tiger Data | Electricity prices and scores stored over time, powering "what changed" | Noah + Allen |
| MLH Vultr | Backend hosted there | Allen |
| MLH GoDaddy Registry | Domain pointed at the live site | Noah |
| ChatOverflow | Each person connects their coding agent. No project work | Everyone, 5 min |
| Best Rookie | Only if this is everyone's first hackathon | AJ checks |
| DEV writing | After the deadline, optional | AJ |

Skip: Solana, MongoDB, Nessie, Photon, Arlequin, Physical AI, healthcare module.

Peri: only enter if someone actually consults a real business this weekend. Peri requires the business name, the person's name and role, and one piece of evidence (screenshot, photo, quote). Replaying a cancelled project does not qualify. Best shot: Saturday 11 AM career fair, or a call with a real broker or developer. If that doesn't happen, don't enter.

SpaceXSI: only if Cursor is your main coding agent and you have a real Grok Bot automation.

## Why the agent is no longer optional

The earlier plan treated the agent as a late add-on. Three prizes (CoStar, Amazon, LangChain) are judged mostly on agentic behavior, so the agent starts Saturday morning, not Saturday night. The math still comes from plain formulas; the agent calls them as tools.

## Schedule (Eastern time)

| When | Goal | Gate |
|------|------|------|
| Fri now → 1:00 AM | Kickoff together: scope, contract, repo, mocks, keys | **Gate 0:** everyone can run web + api locally; mocks merged |
| Sat 1:00 → 4:00 AM | Skeleton: every screen on mocks; formulas in code; endpoints serve mocks | **Gate A (4 AM):** search → `/rank` → cards, with real model numbers |
| Sat 4:00 → 9:00 AM | Sleep in two shifts (two awake at a time, 2.5 h each) while the other pair keeps going | — |
| Sat 9:00 AM → 1:00 PM | Real data in; parcel verdict; slider re-rank + break-even | **Gate B (1 PM):** demo rows 2–6 work without the agent |
| Sat 1:00 → 6:00 PM | Agent with two subagents; watchlist; Tiger Data history | **Gate C (6 PM):** agent produces a report for one Houston parcel from the UI |
| Sat 6:00 → 11:00 PM | Deploy to Vultr, domain, remaining subagent, polish | **Gate D (11 PM):** public URL runs the full demo on a phone |
| Sat 11 PM → Sun 3 AM | Feature freeze. Pre-generate reports for demo parcels. Fix bugs only | **Gate E (3 AM):** release candidate tagged |
| Sun 3:00 → 6:00 AM | README, attributions, video, Devpost draft, rehearse x5 | Devpost draft saved |
| Sun 6:00 → 7:30 AM | Submit. Verify repo is public and all four are on the team | **Submitted by 7:30.** Hard stop is 8:00 AM |
| Sun 9:30 AM → 2:30 PM | In-person judging, 2-minute demo, repeated several times | — |

Check-in every 3 hours, 5 minutes, standing: what I finished, what changed in the contract, what blocks me.

## Fallbacks (decide now, not at 3 AM)

| If this fails | Do this |
|---------------|---------|
| A data source isn't working after 30 min | Hardcode a small labeled sample, move on |
| Agent unreliable at Gate C | One Gemini call writes the report from model numbers. Keep Gemini; drop LangChain claim |
| Vexcel imagery won't load | Free satellite tiles for the visual; say so; drop to one CoStar layer claim only if Matterport also fails |
| Tiger Data won't provision | Local Postgres in Docker on the Vultr box; drop the Tiger claim |
| Vultr deploy broken at Gate D | Run backend on a laptop for judging; drop the Vultr claim |
| Live demo flaky | Pre-generated reports and cached responses. Never present a saved run as live |

## Rules that can disqualify us (from the Devpost rules page)

- Public GitHub repo, created Nov 13–15, code pushed before 8:00 AM Sunday.
- At least 85% of code written during the event. Credit every framework and library in the README and on Devpost.
- LLM use is allowed, but each person must be able to explain their own code. Fully LLM-written projects are "strongly discouraged".
- One main track only. All four members added on Devpost, with Discord usernames.
- Do not embellish in the pitch, README, or Devpost.
- CoStar, Vexcel, and Matterport data is hackathon-use only. Never commit it.

## Known unknowns (as of Friday night)

- **Sponsor data fields are unverified.** Nobody has seen the real CoStar columns, Vexcel attributes, or which Matterport spaces exist. Noah reports this by 4 AM Saturday; the contract's `costar`, `vexcel`, and `matterport` blocks may change then.
- **Model constants are starting values.** Build cost per MW, water ratios, and orbit mass figures are `assumed` until Marvin confirms each in `docs/assumptions.md`.
- **The deepagents API differs by version.** Marvin copies argument names from the installed version's docs.
- **No repo exists yet.** Gate 0 is the first thing to hit.

Each lane file opens with the same "Read this first" box (build order plus the eleven things everyone must know) and a short note on what it means for that person.

## Labeling rule

Every number on screen is tagged one of: `reported` (from a source), `modeled` (our formula), `assumed` (a constant we chose), `sample` (hardcoded fallback). The tag comes from the API, not the frontend.
