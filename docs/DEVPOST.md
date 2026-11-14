# Devpost submission draft

> **Before submitting (deadline 8:00 AM Sun Nov 15):** resolve every `PENDING` line. Delete a sentence if its feature didn't ship, and tick a track only if the "claim only if" condition is true. Remove this box and the track checklist from the pasted text.

## Track checklist (internal, do not paste)

| Track | Claim? | Evidence in the repo today | Claim only if |
|---|---|---|---|
| Business and Enterprise | **Yes** | Property search, listing pages, seven checks, delay-cost scenario | n/a |
| Best Overall | Automatic | n/a | n/a |
| CoStar: AI for the Built World | **Yes** for data and visuals; AI part conditional | CoStar listings in Tiger, Vexcel imagery and 3D, Matterport embeds; direct API check passed for both demo properties | The "AI" sentence stays only if the Gemini property memo runs live |
| Best Use of Tiger Data | **Yes** | `risk_scores` hypertable, PostGIS `ST_Distance` for nearby sites | Don't mention pgvector; nothing uses it |
| Best Use of Gemini API | Conditional | Adapter exists; never run live | Allen's live Gemini call succeeds and the memo is shown in the demo |
| Amazon Best Practical AI | Conditional | Investigator plan and quote gate exist | The investigator completes a live run |
| LangChain deepagents | **No** | No LangChain or deepagents code | Don't tick |
| Best Use of Vultr | Conditional | No deployment yet | The public URL is served from Vultr |
| GoDaddy Registry domain | Conditional | None | A registered domain points at the live app |

---

## Groundwork

**Tagline:** Browse data center sites like listings and see what the delay will cost before you buy the land.

### Inspiration

AI data centers are getting stopped by town councils, water boards and moratoriums, not by engineering. In Texas alone, the public tracker we used lists 349 projects, and 21 of them were withdrawn, denied, suspended, cancelled or caught by a moratorium. Developers usually find out after they've bought the land. We wanted the warning to show up while walking away is still cheap.

### What it does

- **Property search:** CoStar industrial, flex and land listings in Houston and Los Angeles, shown as cards and map pins with the asking price and price per acre.
- **Seven checks per property:** power, water, zoning and permits, community opposition, policy and incentives, land and physical risk, and labor and construction. Each is pass, watch or fail, with its rule and source.
- **Look before you buy:** Vexcel aerial and oblique imagery, Vexcel 3D city tiles, and the property's Matterport interior scan on the listing page.
- **Delay cost in dollars:** a location risk score (0–100 with Low / Watch / High bands) from a model trained on real Texas outcomes, turned into a delay-cost scenario. At 100 MW that's about $12M for Low, $36M for Watch and $66M for High in expected lease exposure.
- **Research workspace:** a shortlist and seven-check comparison of tracked Texas projects, a dated evidence timeline you can replay to any past date, and a watchlist with a change feed.
- `PENDING (Marvin/AJ):` **Buy / Maybe / Pass verdict and "Buy up to $X/acre"**, from a ten-year cost model covering land, build, power, water and maintenance at an 8% discount rate. Includes an evaporative vs. dry cooling toggle and sensitivity to electricity price. Inputs are local and sourced: EIA prices, LADWP and City of Houston water rates, county appraisal land values and a published cooling water table.
- `PENDING (Allen):` **Investigation memo:** Gemini researches a property and writes a sourced memo.

### How we built it

- **Data:** We scraped the More Than Just Parks Texas data center tracker (349 projects). We geocoded each project with the Census Geocoder, then added county density, city-limit and urban-area flags, distance to metro, and WRI Aqueduct water stress. The CoStar hackathon kit supplied 158 Houston and LA listings, plus Vexcel imagery and Matterport scans.
- **Model:** a class-weighted logistic regression on 102 Texas projects with clear outcomes (16 stopped, 86 under construction). Cross-validated ROC AUC is 0.70 ± 0.15. We show observed stopped shares per band (5.9% / 17.5% / 32.2%) instead of pretending the score is a probability.
- **Database:** Tiger Data (Postgres with TimescaleDB and PostGIS). Model runs are stored in a `risk_scores` hypertable, and PostGIS distance queries find nearby alternatives.
- **App:** Next.js 15 with server components querying Tiger directly, plus MapLibre maps. The Vexcel key stays server-side behind a hardened proxy.
- **Sourcing rule:** every cost or rate names a source ID in our source registry and is tagged reported, modeled or assumed.
- `PENDING:` deployment target and URL.

### Challenges we ran into

- **Honest numbers.** Our first version called the model output a "% chance of being blocked". It isn't calibrated, so we replaced it with a banded score and observed outcome rates.
- **Public data disagrees.** Our Houston demo property is 1.27 acres in CoStar but 1.00 acre across its four appraisal-district lots. The Los Angeles one is a condo in CoStar but a single fee parcel at the County Assessor. Public asking prices differ from the kit too. We record which figure each calculation uses.
- **Tariffs are hard to find.** Large-load electricity tariffs live in PDFs and rate filings. Where we couldn't get a local tariff we used state averages, labelled as proxies.

### Accomplishments that we're proud of

- A model trained on real outcomes, with a retrospective evidence timeline that you can roll back to any date.
- Every number in the app traces to a source, and estimates are labelled as estimates.
- Live sponsor data on the same page: CoStar listing facts, Vexcel imagery and 3D, and a Matterport scan matched to the property.

### What we learned

Community and water risks show up in public records months before a project dies. Getting from a risk score to a dollar decision takes local inputs (power price, water price, land value) that are scattered across utilities, appraisal districts and broker reports.

### What's next for Groundwork

Local utility tariff builds (CenterPoint, LADWP), interconnection cost estimates, scheduled monitoring of county agendas with alerts, and more states.

### Built with

`nextjs` `typescript` `react` `tailwindcss` `maplibre` `postgresql` `timescaledb` `postgis` `tiger-data` `python` `scikit-learn` `costar` `vexcel` `matterport` `eia-api` `fema-nfhl` `PENDING: gemini` `PENDING: vultr`
