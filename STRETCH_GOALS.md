# Stretch goals: differentiate from PVcase Prospect

## Context
PVcase Prospect (main competitor) already has: county-level AI community
sentiment + opposition maps (from news, meeting notes, municipal records),
grid upgrade costs in dollars, fiber/gas proximity parcel search, zoning,
flood, and buildable-area analysis. Don't rebuild those.

Their gaps (per their help docs): no alerts/monitoring, no outcome
prediction or validation, sentiment is county-level only, no delay/opposition
cost, and the UI is a complex GIS tool for analysts.

Read the codebase first, propose a plan, then build these in order on top of
what exists. Label any mock data clearly in the UI.

## Goals
1. **Watchlist + alerts.** Save sites; track risk score history; alert when a
   site's risk changes (e.g. Watch → Red) with the reason and source link.
   Add a "simulate new event" button for the demo.

2. **Site-level risk, not county-level.** Score individual parcels using
   distance to homes/schools/water, local fights, moratoriums, and nearby
   documents geocoded to the site.

3. **Predict outcomes + backtest.** Train a simple model on past projects
   labeled stopped vs. built, using only pre-decision data. Output a
   probability and show held-out results ("flagged X of Y stopped projects").

4. **Opposition/delay cost in dollars.** expected_cost = P(blocked/delayed)
   × typical delay months × MW × 1000 × lease rate ($/kW/month, default 170,
   editable). Show alongside build cost.

5. **Simple decision-maker UI.** Airbnb-style listing cards + risk-colored
   map + site page with headline "X months expected delay · $Y expected cost".
   No GIS jargon.