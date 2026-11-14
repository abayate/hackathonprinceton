# 00 — Overview: scope, tracks, schedule, rules

Read this first. Then `01-contract.md`, your own lane file, `06-git-workflow.md`, and `07-costar-track.md`.

## The product

**Groundwork** (working name): a listings-style site where a developer or investor searches for land to build an AI data center on, and gets an investment verdict on each prospect.

For every prospect (a parcel or existing building in Houston or Los Angeles) it answers:

1. **Is it worth buying?** Buy, Maybe, or Pass, with the reasons.
2. **What is the most we should pay?** "Worth buying up to $X per acre."
3. **What would it cost to build and run there?** Ten-year cost, power, cooling, water.
4. **What could kill the deal?** Water stress, grid wait, flood, distance to homes, local opposition.
5. **How does it compare?** Against other U.S. markets, and against orbit, with the tipping point stated.

One main user: a data center developer, land investor, or lender screening sites before paying for engineering and legal studies.

## The demo (this table IS the scope)

If a feature is not in this table, nobody builds it until every row works end to end.

| # | Time | What the judge sees | What has to work | Owner |
|---|------|--------------------|------------------|-------|
| 1 | 0:00–0:15 | Spoken pitch: billions committed to sites picked on incomplete information | Nothing | AJ |
| 2 | 0:15–0:25 | Search pre-filled: "100 MW, ready by 2029, lowest cost". Hit search | Search form | AJ |
| 3 | 0:25–0:40 | Land prospects in Houston and LA as cards beside a map, each with Buy / Maybe / Pass and a max price | `POST /prospects` from CoStar data + the model | AJ, Noah, Marvin, Allen |
| 4 | 0:40–1:00 | Open a Houston prospect: aerial image, property facts, "Buy up to $X per acre", the checks, ten-year cost, power and water | Prospect page: Vexcel image, CoStar record, verdict, breakdown | AJ, Noah, Marvin, Allen |
| 5 | 1:00–1:20 | Click Investigate: agent steps appear, then an investment memo with sources. Badge: "Verified on Solana" | Agent run, memo stored, hash attested | Marvin, Allen, Noah, AJ |
| 6 | 1:20–1:30 | Open an LA prospect: "Pass", with the reasons | Second hand-checked prospect | Marvin, Noah |
| 7 | 1:30–1:45 | Markets tab: U.S. regions plus Low Earth Orbit. Drag launch cost; orbit climbs; "Orbit beats Houston below $X per kg" | `/rank`, live re-rank, break-even | AJ, Marvin |
| 8 | 1:45–1:55 | Tap heart. Watchlist: "Power prices rose; this prospect's max price fell" | Save + one real change | AJ, Allen, Noah |
| 9 | 1:55–2:00 | Who it's for, what's next | Nothing | AJ |

Rows 3–6 are the product. Row 7 is the "ah-ha" extra. If time runs short, cut row 7's animation before anything in rows 3–6.

## Lanes

| Person | Lane | File |
|--------|------|------|
| AJ | All frontend. Presents the pitch | `02-aj-frontend.md` |
| Marvin | Model + Agent: formulas, prospect scoring, verdict, break-even, the deep agent | `03-marvin-model-agent.md` |
| Allen | Backend: repo, FastAPI routes, MongoDB Atlas, Tiger Data schema, agent run plumbing, Vultr deploy | `04-allen-backend.md` |
| Noah | Data: CoStar, Vexcel, Matterport, public datasets, history loads, Solana attestation, domain, README, Devpost, DEV post | `05-noah-data.md` |
| Everyone | Git workflow | `06-git-workflow.md` |
| Everyone | CoStar track: how we use the data, who does what | `07-costar-track.md` |

AJ has the largest lane. If the frontend falls behind at any gate, Noah picks up pages from it.

## Stack

- Frontend: Next.js (App Router, TypeScript), Tailwind, MapLibre GL, Recharts.
- Backend: Python 3.11+, FastAPI, Pydantic v2.
- Model: plain Python in `model/`, no LLM, tested with pytest.
- Agent: LangChain `deepagents` with Gemini.
- **MongoDB Atlas:** documents. Prospects, agent runs, investment memos, watchlist, attestations.
- **Tiger Data:** time series only. Electricity prices, scores, and max prices over time.
- **Solana devnet:** a hash of each finished investment memo, so anyone can check the memo wasn't altered after it was issued.
- Hosting: backend on Vultr, frontend on Vercel, GoDaddy Registry domain.

Each database has one job. Nothing is stored in both.

## Repo layout

```
/web            Next.js app                 (AJ)
/api            FastAPI app                 (Allen)
/model          formulas + tests            (Marvin)
/agent          deep agent + tools          (Marvin)
/datasources    data clients + loaders      (Noah)
/attest         memo hashing + Solana       (Noah)
/scripts        data build + load scripts   (Noah)
/mocks          example JSON per endpoint   (Allen)
/data           public files only. NEVER sponsor data
/docs           assumptions, sponsor notes  (Noah)
```

`data/private/` is git-ignored. All CoStar, Vexcel, and Matterport files go there.

## Tracks we enter

### Main track

Business & Enterprise, the only main track. Best Overall is automatic (a track winner cannot also win Overall). Best Rookie only if this is everyone's first hackathon.

### The seven MLH tracks we enter

Each has a real job in the product. A track is only ticked on Devpost if its feature works on the public URL.

| MLH track | Its job in Groundwork | Owner | Build priority |
|-----------|----------------------|-------|----------------|
| Gemini API | The agent's model, and vision on the aerial image | Marvin | 1 |
| Vultr | Hosts the backend | Allen | 2 |
| MongoDB Atlas | Stores prospects, agent runs, memos, watchlist | Allen | 3 |
| Tiger Data | Stores price and score history; powers "what changed" | Noah (loads), Allen (schema) | 4 |
| GoDaddy Registry | The public domain | Noah | 5 |
| Solana | Attests each memo's hash on devnet; Verify button | Noah (`attest/`), Allen (routes), AJ (badge) | 6 |
| DEV | A technical write-up of the build | Noah | 7 |

Notes:

- **SpaceXSI: not entering.** It requires Cursor as the core coding agent plus a Grok Bot automation. We code in Claude Code, so claiming it would be false and could disqualify us. Claude Code does qualify for ChatOverflow (below).
- **DEV:** Noah checks the MLH page for its deadline; it may differ from the hackathon's.
- **Cut order if time runs out** (last built, first cut): DEV, Solana, GoDaddy, Tiger Data. Never cut rows 3–6 of the demo to save a track.

### Sponsor tracks

| Track | What qualifies us | Owner |
|-------|-------------------|-------|
| CoStar "Inside and Out" ($1,500). See `07-costar-track.md` | The agent combines CoStar records, Vexcel imagery, and Matterport scans on one prospect. Judged 30% data use, 30% agentic depth, 25% usefulness, 15% demo | Marvin + Noah |
| Amazon Practical AI | The agent reasons, plans, acts, adapts; the watchlist is the every-day use. Needs docs and a clear target user | Marvin + Noah |
| LangChain deepagents | The prospect investigator is a deepagent | Marvin |
| ChatOverflow | Each person connects Claude Code to ChatOverflow | Everyone, 5 min |
| Peri | Only with a real consult this weekend: business name, person's name and role, evidence | AJ decides |

Skip: Nessie, Photon, Arlequin, Physical AI, healthcare module.

## Schedule (Eastern time)

| When | Goal | Gate |
|------|------|------|
| Sat now → 2:00 AM | Kickoff: scope, contract, skeleton, mocks, keys | **Gate 0:** everyone runs web + API locally on mocks |
| Sat 2:00 → 5:00 AM | Skeleton: every screen on mocks; formulas coded; routes serve mocks; sponsor data opened; demo prospects picked | **Gate A (5 AM):** search → `/prospects` → cards with real model numbers on sample data |
| Sat 5:00 → 9:00 AM | Sleep in two shifts | — |
| Sat 9:00 AM → 1:00 PM | Real CoStar and Vexcel data; verdict and max price; prospect page | **Gate B (1 PM):** demo rows 2–4 and 6 work on real data |
| Sat 1:00 → 6:00 PM | Agent and memo; MongoDB storage; Tiger history; watchlist; markets tab | **Gate C (6 PM):** agent memo for one Houston prospect from the UI |
| Sat 6:00 → 11:00 PM | Vultr deploy, domain, Solana attestation, break-even slider polish | **Gate D (11 PM):** full demo on the public URL from a phone |
| Sat 11 PM → Sun 3 AM | Freeze: bugs only, pre-generate memos, secrets audit | **Gate E (3 AM):** release candidate tagged |
| Sun 3:00 → 6:00 AM | README, DEV post, video, Devpost draft, rehearse x5 | Devpost draft saved |
| Sun 6:00 → 7:30 AM | Submit | **Submitted by 7:30.** Hard stop 8:00 AM |
| Sun 9:30 AM → 2:30 PM | In-person judging, 2-minute demo | — |


Check-in every 3 hours, 5 minutes: what I finished, what changed in the contract, what blocks me.

## Fallbacks (decided now)

| If this fails | Do this |
|---------------|---------|
| A data source isn't working after 30 min | Hardcode a small labeled sample, move on |
| Agent unreliable at Gate C | One Gemini call writes the memo from model numbers. Keep Gemini; drop the LangChain claim |
| Vexcel imagery won't load | Free satellite tiles for the visual, labeled; CoStar + Matterport still give two layers |
| MongoDB Atlas won't connect | In-memory store behind the same functions; drop the MongoDB claim |
| Tiger Data won't provision | Skip history; watchlist shows current values only; drop the Tiger claim |
| Solana devnet down or airdrop fails | Memo shows its SHA-256 hash and "Attestation unavailable"; drop the Solana claim |
| Vultr deploy broken at Gate D | Run the backend on a laptop for judging; drop the Vultr claim |
| Live demo flaky | Pre-generated memos with their real timestamps. Never present a saved run as live |

## Rules that can disqualify us (from the Devpost rules page)

- Public GitHub repo, created Nov 13–15, code pushed before 8:00 AM Sunday.
- At least 85% of code written during the event. Credit every framework and library in the README and on Devpost.
- LLM use is allowed, but each person must be able to explain their own code. Fully LLM-written projects are "strongly discouraged".
- One main track only. All four members added on Devpost, with Discord usernames.
- Do not embellish in the pitch, README, or Devpost.
- CoStar, Vexcel, and Matterport data is hackathon-use only. Never commit it.

## Known unknowns

- **Sponsor data fields are unverified.** Nobody has seen the real CoStar columns, Vexcel attributes, or which Matterport spaces exist. Noah reports by 5 AM; the contract's `costar`, `vexcel`, and `matterport` blocks may change then.
- **How many usable land prospects the CoStar extract holds** for a data center (industrial, land, large commercial). This decides how full the listings page looks.
- **Model constants are starting values**, `assumed` until Marvin confirms each in `docs/assumptions.md`.
- **The deepagents and Solana library APIs differ by version.** Copy from the installed version's docs.
- **DEV requirements and deadline** are unread; Noah checks the MLH page.

## Labeling rule

Every number on screen is tagged `reported` (from a source), `modeled` (our formula), `assumed` (a constant we chose), or `sample` (hardcoded fallback). The tag comes from the API, not the frontend.
