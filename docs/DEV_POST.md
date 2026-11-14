---
title: "Pricing the town council: what a stopped data center costs, before you buy the land"
published: false
tags: ai, datascience, postgres, hackathon
---

> Draft for DEV. Resolve the `PENDING` lines before publishing; cut anything that didn't ship.

At HackPrinceton Fall 2026 our team built **Groundwork**, a site browser for AI data centers. It looks like a property listing site, but each listing answers one question: if we buy this land, what will local opposition, water and power cost us in delay?

## The problem

Data center projects are stopped more and more often by local government. Councils deny rezonings, counties pass moratoriums, and water districts pause permits. The tracker we used lists 349 Texas projects, and 21 of them were withdrawn, denied, suspended, cancelled or caught by a moratorium. The warning signs are usually public months earlier, in council agendas, local news and water-district minutes. They're just scattered.

## What we built

1. **Listings.** CoStar industrial and land listings in Houston and Los Angeles, on a map with cards.
2. **Seven checks.** Each property gets pass / watch / fail on power, water, zoning, community opposition, policy, land and physical risk, and labor. Every check shows its rule and its source.
3. **A model trained on outcomes.** A logistic regression trained on 102 Texas projects with clear outcomes (16 stopped, 86 under construction), with ROC AUC 0.70 ± 0.15 in cross-validation. The features are deliberately simple: inside city limits, urban area, county density, distance to a metro, crypto or not, and how many projects the county already has.
4. **Dollars, not scores.** Each risk band maps to the stopped share we actually observed in held-out predictions. That share × an assumed 12-month delay × lease cost (~$170/kW/month) gives about $36M of exposure for a 100 MW project in the Watch band.
5. **Look at the site.** Vexcel aerials and 3D city tiles, plus the building's Matterport scan, on the listing page.
6. `PENDING:` **A verdict.** Buy, Maybe or Pass, with a maximum price per acre from a ten-year cost comparison.

## Three things we learned

**1. Don't call a score a probability.** Our first draft said "59% chance of being blocked." The model isn't calibrated and the training label is *stopped*, not *delayed*. We switched to a 0–100 score with bands, and we show the observed outcome rate for each band. The numbers got smaller and more defensible.

**2. Public records disagree, so record which one you used.** Our Houston demo warehouse is 1.27 acres in CoStar but 1.00 acre across its four appraisal-district lots. Our LA demo building is flagged as a condo in one dataset and a single fee parcel at the County Assessor, which also shows the parcel as tax-delinquent. Neither discrepancy is a bug in our code, but either one changes a per-acre price. Every input file we ship tags each value as *reported*, *modeled* or *assumed* and names its source.

**3. The local inputs are the hard part.** The model was the easy part. California's August 2026 industrial average power price (24.1¢/kWh) is about 3.3× the Texas average (7.2¢/kWh, both from the EIA API). LADWP's commercial water tier 2 works out to about $19.40 per 1,000 gallons, against $9.34 in Houston. An evaporative cooling tower uses roughly 2–4 litres of water per kWh, while dry cooling uses almost none but more power. These numbers move a ten-year cost more than any risk score, and they're spread across utility PDFs and broker reports.

## Stack

- **Tiger Data** (Postgres + TimescaleDB + PostGIS): model runs in a `risk_scores` hypertable, with PostGIS distance queries for nearby alternatives.
- **Next.js 15** server components query the database directly, with **MapLibre** maps.
- **Python + scikit-learn** for features and the model.
- **CoStar, Vexcel and Matterport** sponsor data, kept out of git; the Vexcel key never reaches the browser.
- `PENDING:` **Gemini** for the investigation memo; deployment on `PENDING`.

## What's next

Utility tariff builds instead of state averages, interconnection cost estimates, and scheduled monitoring of county agendas that alerts you when a property's verdict changes.

`PENDING:` links to the repo, the live demo and the Devpost page.
