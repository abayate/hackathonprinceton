# HackPrinceton Fall '26: Our Tracks

Submit on [Devpost](https://hackprinceton-fall-26.devpost.com/) by **8:00 AM Sunday, Nov 15**. Tick every special track and MLH prize below on the submission.

## Summary

| Track | Run by | Prize | Our angle in one line |
| --- | --- | --- | --- |
| **Business and Enterprise** (main) | HackPrinceton | AirPods Pro 3 each | B2B site risk tool that prices delay in dollars for data center developers |
| Best Overall Hack (automatic) | HackPrinceton | PS5 each | Airbnb-style site search with a backtested risk model behind every listing |
| AI for the Built World | CoStar Group | $1,500 / $500 / $250 cash | Agent that combines Vexcel aerials and Matterport scans to judge Houston sites and buildings |
| Best Practical AI Innovation | Amazon | $125 / $75 / $50 per person | Agent that reads county agendas and news and updates site risk without being asked |
| Best use of deepagents | LangChain | Switch 2 | The site investigator is a deepagent: a lead agent that plans and delegates to land, power and water, and community subagents |
| Best Use of Gemini API | MLH | Swag kits | Gemini reads aerial images, tags local documents and writes every score explanation |
| Best Use of Tiger Data | MLH | Stream Deck Mini | Risk history as a hypertable, geospatial checks in PostGIS, document search in pgvector |
| Best Use of Vultr | MLH | Assorted prizes | Web app, API and a scheduled agent worker hosted on Vultr |
| Best Domain Name from GoDaddy Registry | MLH | Digital gift card | Short domain that says the pitch, live on the deployed app |

---

## Business and Enterprise (main track)

**Who pays:** data center developers and site-selection teams, with investors and lenders second.

**What we show them:**
- **Search page:** Houston-area candidate sites as listing cards and map pins colored Green / Watch / Red. Filters: MW needed, max cost per MW, months to power, "no moratorium".
- **Site listing page:** the seven buildability checks (power, water, zoning, opposition, policy, land and physical risk, labor), each pass / watch / fail with sources.
- **Cost box:** build cost (MW × ~$11.3M/MW standard, $20M+/MW AI-ready), yearly power cost from EIA prices, and **expected delay cost** = P(blocked or delayed) × expected months × ~$17M per month for 100 MW. Sliders for MW size, electricity price and cooling type recalculate it live.
- **Compare page:** 2 to 4 saved sites side by side on total expected cost.
- **Watchlist:** risk changes become alerts. This is the subscription hook.

**Business model on one slide:** free public map; paid per-seat subscription plus per-site monitoring for developers; enterprise license for lenders.

**Demo number to land:** "A 6-month delay on a 100 MW campus is ~$100M. We flag it before land is bought."

---

## Best Overall Hack (automatic)

We're judged on the four-part rubric, so hit each one in the pitch:
- **Creativity:** a familiar Airbnb interface over a problem most people don't know exists, where $130B of projects were blocked or delayed in a single quarter.
- **Utility:** a working search, listing page, cost box and live alert, not mockups.
- **Charity:** the free community view shows residents what's proposed near them, the water and power impact, and upcoming hearings.
- **Avidity:** the backtest number and the "roll back to the land purchase date" moment.

---

## CoStar: Inside and Out, AI for the Built World

Their data covers Houston and LA, so **our demo is Houston**. We use two of the three layers, and the agent uses them together, not as decoration.

**Vexcel (view from above):**
- Aerial image of each parcel as the listing photo, with the parcel outline drawn on top.
- Gemini inspects the image for things that change the score: open or cleared land vs. built up, visible substations or transmission lines nearby (power check), rooftops of homes and schools close to the site (opposition check), and standing water or low ground (flood check).
- Results feed the checks directly, e.g. "~40 homes within 500 m of the parcel edge → opposition risk up."

**Matterport (inside the building):**
- For existing warehouses and industrial buildings, which are cheaper and faster than greenfield builds, the agent reads the 3D scan for clear height, open floor area, column spacing, loading docks and space for electrical rooms.
- Output: a **conversion fit** of pass / watch / fail with the reasons, e.g. "clear height too low for raised floor plus overhead cooling."

**Agentic, not a chat wrapper:** given "find me 50 MW in Harris County", the agent plans its steps: shortlist parcels, pull Vexcel imagery, check the Matterport scan if a building exists, query EIA prices, score all seven checks, write the report and add the best sites to a watchlist. It decides which layer to call based on what it finds (no scan if the land is vacant).

**Why CoStar should care:** their brokers and lenders get a buildability answer for a parcel, not just its comps.

---

## Amazon: Best Practical AI Innovation

**Real user:** a site selector tracking dozens of candidate parcels for a year or more.

- **Agentic behavior:** a multi-step loop runs on a schedule. It fetches new county agendas, planning minutes and local news, tags each document ("rezoning hearing scheduled", "moratorium proposed", "residents opposed water use"), rescores the affected sites and sends an alert when a site changes band.
- **Real-world impact:** catches opposition months before a hearing, when walking away is still cheap.
- **Adaptive intelligence:** developers can attach verified data or dispute a finding. The agent re-scores with the new evidence and keeps the dispute visible, but it can't be told to hide a risk.
- **User-friendly design:** an Airbnb layout people already know, with answers in months and dollars instead of a 1–10 score.
- **Deliverables they require:** working prototype, target user stated in the README, and the 2-minute pitch.

---

## LangChain: Best use of deepagents

The "Investigate" button on a site page starts a deepagent run on Gemini (`langchain-google-genai`). It uses the features that make deepagents different from a single tool-calling loop:
- **Planning:** the lead agent writes a to-do list for the site first (e.g. "check size and price, inspect aerial, check scan if building, power cost, water stress, search opposition, write memo") and ticks items off. The UI shows each step live.
- **Subagents:** the lead delegates to three specialists with their own context and tools:
  - `land`: CoStar record, Vexcel aerial image (Gemini vision), Matterport scan if a building exists
  - `power_water`: EIA prices, water stress, and the model functions for ten-year cost and power and water use
  - `community`: web and news search for opposition, hearings and moratoriums near the site
- **Virtual file system:** each subagent writes its findings to a file (`land.md`, `power_water.md`, `community.md`), and the lead reads them to write the investment memo, so long tool output doesn't flood one context.
- **Numbers come from tools, not the LLM:** every figure in the memo is a model function's output, with its source.
- **Outcome:** memo with recommendation, max price, deal risks, open questions and sources, saved and shown with its timestamp.

---

## MLH: Best Use of Gemini API

Gemini does three distinct jobs, which is more than a chatbot:
1. **Vision:** reads Vexcel aerial images to spot substations, nearby homes, open land and water (see CoStar above).
2. **Document understanding:** reads long county agendas and minutes (PDFs) and pulls out the data center items, hearing dates and the stance of residents and officials as structured tags.
3. **Explanation:** writes the plain-language "why this site is Red" summary on every listing, quoting the source documents, plus the "What the neighbors are saying" section.

The orchestrating agent runs on Gemini function calling over our tools (imagery, scans, EIA, database).

---

## MLH: Best Use of Tiger Data

Tiger Data is built for time series, and our core story is **risk changing over time**:
- **`score_history` as a hypertable:** every rescore is a timestamped row per site and check. The watchlist feed and the "risk went Watch → Red" chart come from it.
- **"Roll back to the land purchase date" demo:** query a site's score `as of` a past date. This is also how the backtest avoids leaking the outcome.
- **`electricity_prices` as a hypertable** from EIA, with a **continuous aggregate** for monthly averages by region that feeds the cost box instantly.
- **Continuous aggregate for the map:** average risk by county per week, so the dashboard loads fast.
- **PostGIS:** distance from each parcel to homes, schools, substations and flood zones, computed in SQL.
- **pgvector + vectorscale:** embed agenda and news chunks so the agent can retrieve "all opposition mentions near this site" semantically, and so listings can quote their sources.

Our existing tables (`parcels`, `regions`, `electricity_prices`, `reports`, `score_history`, `watchlist`) already map onto this.

---

## MLH: Best Use of Vultr

- **Cloud Compute instance** runs the web front end and API, so judges can open the live site on their phones.
- **Scheduled worker** on the same box runs the monitoring agent (new agendas → rescore → alerts) on a cron, so the watchlist updates itself.
- **Object Storage** caches Vexcel image tiles and agenda PDFs so listing pages load fast and we don't refetch.
- In the Devpost write-up, say exactly which parts run on Vultr.

---

## MLH: Best Domain Name from GoDaddy Registry

They judge the name, so it should carry the pitch. Ideas (**availability not checked**):
- `willitbuild` — the question every developer asks
- `canibuild` — same question, first person, memorable in a demo
- `zonedout` — the opposition and zoning angle in two syllables
- `gridready` — the power angle, sounds like a product

Register through GoDaddy Registry with the MLH code, point it at the Vultr server, and show the live URL at the start of the demo.
