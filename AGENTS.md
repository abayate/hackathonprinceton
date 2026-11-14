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

Not chosen yet; there is no code in the repo. Update this section once a stack is picked.
