# Groundwork

**Find land worth buying for an AI data center, know the most you should pay, and see what could kill the deal.**

Built at HackPrinceton Fall 2026 (Nov 13–15) · Track: Business & Enterprise

> **Status: in progress.** Sections marked _TODO_ are filled in as features land. Nothing here should describe a feature that doesn't work on the live site.

## The problem

A company that needs AI compute has to commit to land before it knows the things that kill projects: how long the grid connection takes, whether there is enough water, whether the neighbors will fight it, and what the site is really worth. Projects worth billions get delayed or cancelled after the land is already bought.

_TODO: one sourced statistic on delayed or cancelled projects, traced to the original report._

## What Groundwork does

You search for data center land the way you'd search for an apartment. For each prospect, Groundwork answers five questions.

| Question | What you get |
|----------|--------------|
| Is it worth buying? | **Buy, Maybe, or Pass**, with the reasons |
| What's the most we should pay? | "Worth buying up to $X per acre. Above that, the next-best site is the better deal." |
| What would it cost to build and run there? | Ten-year cost, power, cooling, and water for your workload |
| What could kill the deal? | Size, flood and terrain, distance to homes, water stress, local opposition |
| How does it compare? | Against other prospects, other U.S. markets, and orbit: "Orbit beats this site when launch falls below $X per kg." |

Then an AI agent investigates the prospect. It reads the property record, looks at the aerial image, checks the building scan if there is one, searches for local opposition, and writes an **investment memo** with sources and a list of what is still unknown. The memo's hash is recorded on Solana devnet, so anyone can later check it wasn't altered.

Save a prospect and the watchlist tells you when its verdict or maximum price changes.

## One search, start to finish

_TODO: replace with a real run and real numbers once the model is confirmed._

1. Search: 100 MW, ready by 2029, lowest cost, Houston and Los Angeles.
2. Land prospects appear as cards beside a map, each with a verdict and a maximum price.
3. Open a Houston prospect: aerial view, property facts, "Buy up to $X per acre", and why.
4. Click Investigate: the agent's steps appear, then the investment memo, then "Attested on Solana devnet".
5. Open a Los Angeles prospect: "Pass", and why.
6. Markets tab: the same workload across U.S. regions and Low Earth Orbit. Drag launch cost and watch where orbit starts to win.
7. Save the Houston prospect. The watchlist later reports that power prices rose and the maximum price fell.

## What makes it different

- **It gives a price, not a score.** Every prospect comes with the most it is worth paying and the alternative that sets that limit.
- **It says no.** Prospects that fail on size, flood, neighbors, or water get "Pass", with the reason.
- **The numbers come from formulas, not from the AI.** The agent researches and explains; it calls the model for every figure.
- **Every number is labeled** as reported, modeled, assumed, or sample.
- **Orbit is treated as one more place to build,** with a price, a date, and a tipping point.
- **Community impact is priced in.** Land near homes, in stressed watersheds, or on strained grids is also the riskiest investment, so the verdict steers buyers away from it.

## Who it's for

Data center developers, land investors, and lenders screening sites before paying for engineering and legal studies. It narrows the list; it does not replace those studies.

## How it works

| Part | What it does | Built with |
|------|--------------|------------|
| Model | Energy, water, ten-year cost, verdict, maximum price, market ranking, orbit break-even | Plain Python, unit-tested |
| Agent | Plans a prospect investigation, delegates to subagents, calls the model and data as tools, writes the memo | LangChain deepagents, Gemini |
| Property data | Records, aerial imagery, building scans for Houston and Los Angeles | CoStar, Vexcel, Matterport |
| Public data | Electricity prices, grid emissions, water stress | EIA, EPA eGRID, WRI Aqueduct |
| Documents | Prospects, agent runs, memos, watchlist | MongoDB Atlas |
| History | Prices, scores, and maximum prices over time | Tiger Data |
| Integrity | Hash of each memo recorded on chain | Solana devnet |
| Backend | Serves the model, data, and agent runs | FastAPI on Vultr |
| Frontend | Search, prospect listings and map, prospect pages, watchlist | Next.js |

_TODO: architecture diagram (docs/architecture.md). Remove any row that isn't working at submission._

## Run it locally

_TODO: exact commands once the skeleton is in._

## Data sources and attribution

_TODO: confirm each is actually used; add links, years, and licenses._

- CoStar property data, Vexcel aerial imagery, Matterport 3D scans (provided for the hackathon; not included in this repository)
- U.S. EIA electricity prices
- EPA eGRID grid emissions
- WRI Aqueduct water stress
- Epoch AI data center dataset (CC-BY)

## Frameworks and libraries

_TODO: every framework and library used, with links. Required by the hackathon rules._

## What we built this weekend

_TODO: our own work versus what we used._

## Limitations

- Numbers are modeled from stated assumptions, listed in `docs/assumptions.md`. They are not quotes, appraisals, or measurements.
- A verdict is a screen, not a recommendation to transact. Utility capacity, zoning, and permitting are not verified.
- The orbit comparison is a linear first-pass model, not an engineering design.
- Prospects cover Houston and Los Angeles only.
- Solana devnet is a test network; the attestation shows the mechanism, not a permanent record.
- _TODO: anything simplified for the demo._

## Team

AJ (frontend), Marvin (model and agent), Allen (backend), Noah (data).

## Plan

The working plan is in [`plan/`](plan/). Start with [`plan/00-overview.md`](plan/00-overview.md).
