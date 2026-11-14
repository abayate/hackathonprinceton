# Data Center Siting & Risk Platform — Project Brief

Nov 14, 2026 · @FoeNem

## The pitch

**One line:** Browse every possible AI data center site in the US like listings on Airbnb, and see in dollars and months whether each one will actually get built.

**The problem.** Building a data center now fails less on engineering and more on everything around it: getting power, getting water, getting zoning, and surviving local opposition. Developers often find these problems after they've already bought land or signed options, when a cancelled or delayed project is most expensive.

**The customer.** Data center developers and their site-selection teams first; investors, lenders and vendors second. Communities get a free public layer, but they are not who pays.

**What makes it different from a siting dashboard:**

- A risk model that is backtested on real projects that were stopped or built
- An AI pipeline that reads county agendas, zoning notices and local news to catch opposition early
- Answers in expected delay (months) and expected cost (dollars), not 1–10 scores
- A watchlist that alerts when a site's risk changes, which is the reason to come back

## Who pays and why they come back

The free public map earns attention and data; developers, investors and vendors pay for decisions and alerts.

| Customer | What they buy | Why they come back | Pricing idea |
| --- | --- | --- | --- |
| Developers / site selectors | Full site reports, risk monitor on their pipeline, scenario tool | They track dozens of candidate sites for a year or more; scores change weekly | Annual subscription per seat + per-site monitoring |
| Investors and lenders | Portfolio risk monitoring, quarterly risk reports | They need ongoing risk on projects they finance | Enterprise license |
| Vendors (cooling, power, construction, law firms) | Early signals on where projects are coming | New projects appear constantly | Lead feed subscription |
| Communities (free) | "Watch my county" alerts, plain-language impact estimates | Hearings, comment deadlines, new proposals | Free; they report local signals that improve the model |

**Rule that protects credibility:** developers can add verified data and respond to estimates, but cannot edit or hide them.

**Pitch line:** Visibility is free. Decisions cost money.

## Buildability checks

Every site gets a pass / watch / fail on seven checks, and each check feeds the delay and cost estimate.

| Check | What we look at | Why it can kill a project |
| --- | --- | --- |
| Power | Nearby substations and transmission, utility capacity, interconnection queue length, local electricity price | No power means no data center; waits for new capacity can run years |
| Water | Water stress of the basin, local supply, drought history, cooling type that fits the climate | Water-stressed areas face pushback and limits on cooling water |
| Zoning and permits | Current zoning, whether data centers are allowed by right, permit timelines, existing moratoriums | A rezoning fight or moratorium can stall a site indefinitely |
| Community opposition | Past fights, distance to homes and schools, meeting minutes, local news, petitions | Hundreds of projects have been stopped locally |
| Policy and incentives | State tax breaks, pending bills, ratepayer protection rules, disclosure laws | Incentives change the cost; new rules can change the math mid-project |
| Land and physical risk | Parcel size, flood zone, heat, wildfire, seismic risk, fiber access | Determines whether the site is usable and insurable |
| Labor and construction | Construction labor availability, local wages, supply of electricians | Labor shortages slow builds and raise costs |

Each check links to its sources (filings, agendas, datasets) so a user can see why the score is what it is.

## The money

A 100 MW AI campus costs $1–2B+ to build, and each month it sits blocked can cost roughly $16–18M in lost lease revenue, so even small improvements in picking sites are worth a lot.

| Stat | Figure | Source |
| --- | --- | --- |
| Average construction cost, standard data center (2026) | \~$11.3M per MW, up from $7.7M in 2020 | [JLL via datacentres.com](https://www.datacentres.com/news/data-centre-construction-costs-11m-per-mw) |
| All-in greenfield cost, US and Canada (excludes chips) | $8.9M–$23.3M per MW; up 21% since late 2024 | [Cushman & Wakefield via CRE Daily](https://www.credaily.com/briefs/data-center-construction-costs-jump-21-since-2024/?.tsrc=rss) |
| AI-ready facility | $20M+ per MW | [Archdesk](https://archdesk.com/blog/ai-data-center-costs) |
| Lease rate, 10 MW+ deals, North America | \~$160–$185 per kW per month | [CBRE via Data Center Frontier](https://www.datacenterfrontier.com/site-selection/news/55401462/cbre-record-data-center-construction-fails-to-ease-capacity-constraints) |
| Projects blocked or delayed by local opposition, Q1 2026 | At least 75 projects, \~$130B | [Data Center Watch](https://www.datacenterwatch.org/q1-2026) |
| Projects blocked or delayed, Q2 2026 | At least 45 projects, \~$68B; more than half of large new proposals that quarter | [Trending Topics](https://www.trendingtopics.eu/us-data-center-opposition-q2-2026/) |
| Local opposition groups | 843 groups in 49 states (mid-2026), up from 396 at end of 2025 | [Trending Topics](https://www.trendingtopics.eu/us-data-center-opposition-q2-2026/) |

**Worked example (our own math, for the pitch):**

- Build cost: 100 MW × $11.3M = \~$1.1B for a standard build; at $20M+ per MW an AI build is $2B+.
- Cost of one month of delay: 100,000 kW × \~$170 per kW per month = \~$17M in lost lease revenue, before financing costs on capital already spent.
- So a 6-month delay is roughly $100M, and a project killed after land and design spending loses that sunk cost too.

Caveat: Data Center Watch's totals combine blocked and delayed projects, so they measure risk, not permanent cancellations. Say "blocked or delayed" in the pitch.

## Risk model and data

The model predicts the chance a site gets blocked or delayed, then converts that into expected months and dollars; we prove it with a backtest on past projects.

**How it works**

1. Collect features for each site: power, water stress, zoning, distance to homes, past local fights, state policy, and signals from meeting minutes and news.
2. An LLM pipeline reads county agendas, planning commission minutes and local news, and tags each document (e.g. "rezoning hearing scheduled", "moratorium proposed", "residents opposed water use").
3. A classifier predicts probability of being blocked or delayed. Expected delay and cost come from that probability times typical delay length and the monthly cost from the money section.
4. The site report shows the top reasons behind each score, with links to the source documents.

**Validation (the key credibility piece)**

- Labels: projects tracked as stopped vs. built or under construction, from public trackers such as the [More Than Just Parks Data Center Tracker](https://morethanjustparks.com/data-center-tracker/about) and Data Center Watch reports.
- Train only on information available before each project's decision date, to avoid leaking the outcome.
- Report accuracy on held-out projects, e.g. "of the projects that were stopped, how many did we flag as high risk?"

**Data sources to check**

| Need | Candidate source |
| --- | --- |
| Existing and planned AI data centers, power, cost | Epoch AI (check license terms before commercial use) |
| Stopped vs. built projects | Data Center Tracker, Data Center Watch |
| Water stress | WRI Aqueduct, USGS |
| Grid and power prices | EIA, utility and ISO interconnection queue data |
| Flood, heat, wildfire | FEMA flood maps, NOAA |
| Opposition signals | County agendas and minutes, local news |

## Website design

The site works like Airbnb or Apartments.com: a map with listing cards on the left, filters on top, and a detailed listing page for each site, except every listing is a possible data center site.

**1. Search page (the home screen)**

- Top bar: search a state, county or city, plus filters like Airbnb's: MW needed, max build cost per MW, max water stress, "no moratorium", time to power, budget.
- Left: scrollable listing cards. Each card shows a satellite thumbnail, the location, a buildability badge (Green / Watch / Red), estimated cost per MW, expected months to power, and a heart icon to save it to a watchlist.
- Right: a map with pins colored by risk, like price pins on Airbnb. Toggle layers for power lines, water stress, flood zones and existing data centers.

**2. Site listing page**

- Header: photo carousel (satellite, street view, parcel outline), the site name, and a headline like "Expected 9 months of delay · $150M expected delay cost".
- The seven buildability checks as rows with icons, like Airbnb's amenities list, each expandable to show the evidence.
- "What the neighbors are saying": the AI's summary of meeting minutes and news, with quoted sources, like Airbnb reviews.
- A cost breakdown box on the right, like Airbnb's booking box: build cost, power cost per year, water, incentives, and expected delay cost, with sliders for MW size, electricity price and cooling type.
- "Similar sites nearby" with lower risk, like "similar listings".

**3. Compare page**

Pick 2–4 saved sites and see them side by side, like Apartments.com's compare view: cost, delay, each check, and total expected cost.

**4. Watchlist and alerts**

Saved sites with a feed of changes, for example: "Loudoun County scheduled a rezoning hearing; risk raised from Watch to Red." Email and push alerts. This is the recurring-use hook.

**5. Public community view (free)**

The same map with a simplified listing page: what's proposed near you, plain-language estimates of water and power impact, upcoming hearings, and a button to report local news or notices.

## HackPrinceton demo

Build a narrow, real slice: one or two states, the search page, one listing page, the watchlist alert, and the backtest result.

**Two-minute demo script**

1. Open the search page, filter for 200 MW with no moratorium, and show colored pins and listing cards.
2. Open a real project that was stopped. Roll the data back to the date its land was bought; the tool flags it Red and quotes the meeting minutes it found.
3. Show the expected delay cost in dollars, then click "similar sites nearby" for a safer alternative.
4. Add both to the watchlist, trigger a new agenda document, and show the alert and the risk change.
5. End on the backtest number and the pitch line: visibility is free, decisions cost money.

**Scope for the weekend**

- [ ] Pick 1–2 states with good public data and several stopped projects
- [ ] Build the site dataset and labels (stopped vs. built)
- [ ] LLM pipeline over a sample of county agendas and news
- [ ] Train and backtest a simple model (logistic regression or gradient boosting is enough)
- [ ] Front end: search page, listing page, compare, watchlist
- [ ] Prepare the stopped-project story for the demo

## Open questions and risks

- **Is the space comparison still in?** If yes, it could be a premium "alternative designs" feature; if not, drop it so the pitch stays focused.
- **Enough labeled data?** Stopped projects number in the hundreds nationally, but for 1–2 states it may be small; consider labeling at the county level too.
- **Data licensing:** confirm Epoch AI and tracker data can be used in a commercial product.
- **Trust:** developer-paid tools can look biased; keep the rule that developers can respond but not edit estimates.
- **Competition:** real estate firms (CBRE, JLL, Cushman & Wakefield) do site selection; our angle is a validated opposition-risk model and continuous monitoring, which they don't sell as software.
