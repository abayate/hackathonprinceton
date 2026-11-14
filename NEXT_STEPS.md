# Current status and next steps

This file tracks progress toward the property investment product. The original weekend plan under [`plan/`](plan/) defines the target direction; its unbuilt features are not current capabilities; see the root [README](README.md) for product, model, data, and run details, and [docs/DEMO.md](docs/DEMO.md) for the timed walkthrough.

## Restored product direction

Property discovery at `/` leads the experience: Houston/LA CoStar records, property facts, recorded asking prices, seven preliminary checks and a saved property-specific review. `/projects` and `/workspace` provide supporting research. The workspace and source checks always use checked-in public projects, even when the property app uses the database. Existing project notes remain separate from property reviews.

## Original core still to build — in this order

1. **Property valuation model:** define and source workload, market, cooling and cost inputs; implement acquisition screening and an explicit maximum-price formula against comparable alternatives. A location risk score is not a Buy/Maybe/Pass verdict. Validate null handling, units and assumptions before surfacing a purchase recommendation.
2. **Ten-year property economics:** combine land, build, utility works, operating costs and the chosen cooling design. Current build and electricity scenarios are only partial inputs, not total cost.
3. **Property investigation and memo:** connect the actual property record, matched imagery/scan and relevant reporting to the model. Keep nearby-project context separate. The existing tracked-project investigator cannot be attached to a CoStar ID as if it were the same entity.
4. **Sponsor spatial experience:** verify Vexcel imagery/3D entitlement and Matterport-to-property matches. Discuss the intended terrain filter before implementation; aerials and approximate points are not terrain assessments.
5. **Prospect monitoring:** persist saved prospects and report real verdict or maximum-price changes after those outputs exist. Browser-tab source checks are supporting research, not a background alert service.
6. **Then the planned extras:** market/orbit comparison and memo attestation. Follow the plan's priority: complete the property and investigation journey first.

## Supporting public research

- Texas tracked-project index with search, status and risk-band filters, cards, and a MapLibre map.
- Individual project pages with a risk score and band, seven buildability checks, a dollar delay-exposure scenario, source-backed evidence timeline with an as-of date, score history, and nearby lower-risk projects.
- Evidence page with model metrics, feature summary, tracked-project map, and stopped-project sources.
- Session watchlist with a change feed and retrospective replay. Public-mode watchlist entries live in process memory and expire; this is not durable storage.
- Guided `/workspace` flow for a brief, a two-to-four-project shortlist, seven-check comparison, decisions, notes, and diligence tasks. Workspace state saves in the current browser. The screen decision brief is implemented; print/PDF pagination still needs an observed check.
- Optional local evidence intake. Exact quote text is matched against fetched public page text; the match does not validate the claim, and the publication date is entered by the submitter. Keep intake disabled on public deployments.
- Public mode runs from repository data with `DATA_MODE=public`; it does not use sponsor listings, sponsor imagery, or a live database.

## Database and sponsor verification

With the user's local database configuration, TLS connectivity, required table reads, the actual project/listing selects, and a PostGIS distance query passed. A read-only local production server returned HTTP 200 for home, one listing, one project, Evidence, and the empty watchlist. Home/listing/project views were inspected in the browser. No database writes or watchlist persistence were exercised. Live Vexcel imagery and 3D remain unverified; a Matterport embed loaded but its property match is unverified. Gemini still needs a separate configured run.

## Remaining work

- Source-check walkthrough completed on Merlin and Sabey: real readings established baselines, repeats reported no new text, and a failed first article fetch recovered. Navigation noise remains. The reading desk groups matching passages by check using explicit keyword labels, and passages can become tasks. Navigation noise and relevance still need work; readings do not change check results. Browser-only history and optional visible-tab rechecks do not supply background monitoring or notifications.
- Recheck the guided comparison at mobile width in a production build and observe print/PDF pagination before treating those parts as complete.
- Verify database writes and failure recovery in an authorized non-production database. Live reads now work; the open Vexcel proxy/provider questions still need configured checks.
- Design durable watchlist and evidence-intake storage with identity-based rate limits before enabling intake or relying on saved state on a public deployment.
- Investigator plan, bounded candidate verification/report, and no-key UI are implemented behind `ENABLE_INVESTIGATOR`. The Gemini adapter is **not tested against the live service**; a live investigation has not been run. Do not claim verified live research or investment memos.
- Improve and independently validate the model and evidence rules. Current evidence records are retrospective, and the San Marcos demonstration is not a historical model backtest.
- The San Marcos held-out score displays as **56/100** (raw 0.569606); the separate stored score displays as **59/100**. Do not round the held-out display to 0.57.
- Decide whether and how sponsor data can be demonstrated or distributed under the applicable event terms; no sponsor dataset is included here.

## San Marcos chronology correction

The August 2025 vote that feeds the evidence rule concerned the **Preferred Scenario Map amendment**. It failed to reach the required super-majority; the contingent zoning item was not acted on. On February 18, 2026, the Preferred Scenario Map amendment was denied 5–2; the zoning change was not heard or voted on. Do not describe the August event as a failed zoning vote. The February report records the outcome after the event and is not a prior warning.

## Spatial design discussion to revisit

- Preserve the intended 3D site exploration experience as the guided workspace develops. The existing sponsor listing views are the starting point; public tracked-project coordinates do not establish parcel boundaries or building geometry.
- Marvin recalls a Vexcel filter for inspecting the landscape or terrain. Discuss the intended interaction with him before choosing a replacement. The exact layer, entitlement, and supported controls have not been verified in this work.
- Keep space in the interface for map, imagery, and 3D views, while clearly distinguishing available views from future capabilities. Do not present unavailable terrain analysis as a working feature.
