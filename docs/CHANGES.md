# Change guide for teammates

This guide covers the accumulated Groundwork change set based on Noah’s original `f986561` checkpoint. At the Task 018 checkpoint, the accumulated patch contained **105 paths**; that is a checkpoint count, not the current manifest count. Task 019 adds the teammate guide and a bounded watchlist request reader. Tasks 020–021 add the guided decision workspace and public source checks. The project now combines a Texas project screening demo with dated evidence, saved-project comparison, and optional local research tools, while keeping database and sponsor paths distinct from public mode.

## Property realignment (Task 024)

The primary route and logo now lead to CoStar property discovery, following Noah's property investment direction. The tracked-project index moved to `/projects`, and `/workspace` is labeled supporting project research. Both data modes can open the research workspace and check its recorded public sources; these still come only from the checked-in public project dataset. CoStar IDs never enter the project workspace or source-check route.

Property pages lead with recorded asking price and a derived per-acre figure when possible. Missing acquisition facts, regional context and illustrative scenarios are distinguished. A separate browser-local property review saves user notes, a next move and generic diligence ticks explicitly. It does not write to Tiger Data or alter a model result. Broken imagery has a visible fallback; 3D availability and Matterport matches remain unverified.

This restores the product direction, not the unfinished valuation engine. Purchase verdicts, maximum price, full ten-year costs, property agent memos, market/orbit comparison and attestation remain planned. See `NEXT_STEPS.md` for the original core in priority order. Prior leakage fixes, evidence attribution and model limitations remain in place.

## 1. What this change set is

The original app used raw model scores to describe a project’s probability of being blocked or delayed, and multiplied that score by an assumed delay period and a monthly lease amount. This change set makes the screening limits visible: scores are shown as a 0–100 index and band, model band outcomes inform a scenario, tracker labels remain attributed to the tracker, and evidence is separated into project signals and geographic context. It also adds a credential-free public data mode, evidence timeline and replay, synthetic database render coverage, and tighter request handling on the server routes. The public demo does not need PostgreSQL or sponsor credentials.

## 2. What you will notice in the demo

| Before | After |
| --- | --- |
| A raw score could be read as a “% chance blocked or delayed.” | The page shows a **0–100 risk score** with a Low risk, Watch, or High risk band. It is a model index trained on tracker “stopped” labels, not a calibrated probability of delay. |
| The delay scenario multiplied raw `p_stopped` by 12 months and the monthly lease amount. That formula varies with the raw score, so there was no single old dollar figure per band. | It uses the **observed stopped share for that score’s band** among pooled held-out predictions, multiplied by the assumed 12 months and a $17M/month lease at 100 MW. Exact old-score ranges and new 100 MW figures are below. |
| A score could round across its display band. | Scores round down: raw `0.596` displays as **59/100**, inside Watch. |
| Tracker outcomes could read like independently confirmed outcomes. | Tracker statuses are explicitly labeled as tracker-reported; the source citations do not independently verify a tracker label. |
| There was no evidence replay flow. | Project pages show dated signals and accept an as-of date. Watchlist shows new changes since saving or a historical replay by publication day. The Evidence page shows recorded case studies and lead-to-outcome comparisons. These records were assembled retrospectively and do not validate the evidence rule. |
| The demonstration depended on database-mode paths. | Public mode reads checked-in public files with no database or sponsor key. A public-mode banner identifies that source/mode in the app. |

### Delay scenario figures at 100 MW

At 100 MW, lease exposure is 100,000 kW × $170/kW/month = **$17M/month**. The old formula was `Old = raw score × 12 months × $17M/month`, so its values span a range within each band. The new values use the model artifact’s held-out stopped share per band and `money()` formatting.

| Band | Old raw-score formula at 100 MW | New band-share scenario at 100 MW |
| --- | --- | --- |
| Low risk (green) | $0–<$81.6M | $12M |
| Watch | $81.6M–<$122.4M | $36M |
| High risk (red) | $122.4M–$204M | $66M |

The raw-score intervals are `[0, 0.4)`, `[0.4, 0.6)`, and `[0.6, 1]`. The ranges follow directly from the old formula at the interval boundaries; the new figures use the artifact’s pooled held-out band shares of 5.9%, 17.5%, and 32.2%, respectively. The new display uses whole millions, so values are rounded for presentation. It is a scenario, not a forecast of delay or realized loss.

## 3. What to update outside the code

The `/workspace` flow adds a brief, a shortlist of two to four tracked proposals, a seven-check comparison, and decisions with editable diligence tasks. State uses browser local storage and is separate from the process-local watchlist. Dated records show project, county, and city scope separately from general reference links. Completing a task does not verify a check. A decision brief is available on screen; print/PDF pagination needs a separate observed check.

Source checks fetch only the selected project's recorded primary, tracker, and project-specific record pages. The first successful read is a baseline; later newly seen paragraphs can enter a review inbox. Users can mark text reviewed or add a diligence task without changing the model or evidence. The monitor retains bounded history in a second browser-storage key, `groundwork.monitor.v1`; workspace decisions use `groundwork.workspace.v1`. Checks are manual unless the visitor enables a 30-minute interval while the tab is open and visible. This does not provide continuous background monitoring or notifications. The route derives URLs from public records rather than accepting arbitrary URLs, uses the existing guarded fetcher, and caps process concurrency and request volume. See the README's source-check section for bounds and limitations.

Check every slide, demo script, pitch, and Devpost description for the old “% chance blocked or delayed” language or old delay-cost figures. At 100 MW, the old formula ranged up to $122.4M in Watch and $204M in High risk; the new displayed scenarios are $36M and $66M. Update comparisons carefully: an old number was raw-score-dependent, not one fixed figure for each band.

Check any San Marcos summary that calls the 2025 Preferred Scenario Map amendment vote a zoning vote. That amendment failed to receive the required super-majority; a contingent zoning item was not acted on. The later February 2026 council action denied the map amendment, while the zoning change was not heard. The two actions are separate records, not failed and final zoning votes.

## 4. Configuration

These are the application configuration names in the root `.env.example`, checked against public application code. Copy only the names you need into your own local environment; never commit real credentials. `web/.env.local` is read by Next.js. Some server secrets can also be read from a repository-root `.env` by `web/lib/env.ts` in local development.

| Variable | Default | Effect |
| --- | --- | --- |
| `DATA_MODE` | Unset means database mode; only `public` selects public mode. | `DATA_MODE=public` reads the checked-in public datasets and avoids database setup. |
| `DATABASE_URL` | No default. | Required when database mode first uses the lazy PostgreSQL pool. |
| `VEXCEL_API_KEY` | No default. | Server-side key for database-mode Vexcel imagery and 3D requests. |
| `VEXCEL_REQUESTS_PER_MINUTE` | 600 when unset or invalid. | Per-process 3D proxy request ceiling; valid integer values are 1–10,000. It is not shared across workers. |
| `ENABLE_EVIDENCE_INTAKE` | Off. | Enables private local evidence intake only when exactly `true`. |
| `ENABLE_INVESTIGATOR` | Off. | Enables the investigator UI only when exactly `true`; keep disabled for public deployments pending durable abuse controls. |
| `GEMINI_API_KEY` | No default. | Server-side credential needed for a live investigator model call when the investigator is enabled. No live call has been verified. |
| `CACHE_DIR` | `../data/private/cache` relative to the web working directory (the repository’s `data/private/cache`). | Location for server-side image cache files; keep sponsor data outside version control. |
| `GOOGLE_API_KEY` | No default; reserved in the example. | Listed in `.env.example` but not currently read by `web/app` or `web/lib`. |

Use **Node.js 24.22.1**, the version used for verification. The app dependency versions are **Next.js 15.5.29** and **MapLibre GL 6.18.0**.

## 5. Database mode: what changed on your paths

- The Vexcel image proxy accepts only canonical `costar-<digits>` IDs and validates the exact listing through the database before serving even a cached image. It reuses a successful validation for up to 60 seconds and at most 200 IDs per process.
- The 3D proxy limits routes to `tileset` and `tile`, applies generic query bounds, and enforces `VEXCEL_REQUESTS_PER_MINUTE` (600 per process by default). The provider’s child-tile query schema has not been confirmed, so valid provider requests may still hit a generic bound.
- Vexcel redirects are followed manually for up to two hops only when the target remains HTTPS on the exact `api.vexcelgroup.com` origin. Cross-host redirects are refused; a provider CDN redirect could therefore make imagery fail until the provider’s redirect contract is known.
- The PostgreSQL pool is lazy: public pages and builds can load without constructing a database connection. Database configuration is required only on the first actual database use.
- The watchlist checks request origin, requires a JSON body bounded to 1 KB, validates the project ID, and validates or rotates its visitor cookie before storing. Visitor cookies are not accounts or durable identities.

If an image fails, first check that the route received a canonical CoStar ID that exists in the configured database and that the server has `VEXCEL_API_KEY`. If 3D tiles fail, check the key and request ceiling, then inspect whether a provider redirect or generic query bound caused refusal. Current paths have not been checked against a live provider, so do not treat this as proof of sponsor compatibility.

## 6. How to verify

Run from a clean checkout with **Node.js 24.22.1**. Start in the repository root, then use the `web/` directory:

```sh
cd web
npm ci
npm test
npm run typecheck
npm run lint
DATA_MODE=public npm run build
npm run smoke
```

- `npm ci` installs the lockfile-defined web dependencies.
- `npm test` runs Vitest and the configured coverage gates. Page-level database rendering uses synthetic fixture rows and a strict mock query responder; it is not a live SQL check.
- `npm run typecheck` checks TypeScript without emitting files.
- `npm run lint` runs ESLint. The current tree may report the existing `Viewer3D.tsx` cleanup-reference warning.
- `DATA_MODE=public npm run build` compiles the production app while the database pool remains lazy; it does not connect to PostgreSQL.
- `npm run smoke` builds and starts the public app on loopback, checks public HTTP routes and the real save/replay request flow, confirms optional private routes stay closed, then stops the app. It requires Node 24+, a clean checkout without local `.env` files, and network access on a fresh build to download Google Fonts. It checks server-rendered HTML and HTTP responses, not browser JavaScript, map rendering, or external tile assets.

For a local public demo instead of a check, run `DATA_MODE=public npm run dev` and open `http://localhost:3000`.

## 7. Not verified

Live read-only database verification is now separate from the fixture checks: TLS connectivity, required table counts, the app's project/listing selects, and a PostGIS distance query succeeded. A local production server with database writes disabled returned HTTP 200 for home, one listing, one project, Evidence, and the empty watchlist. The browser walkthrough inspected home, listing, and project. This establishes selected live reads only: no ingestion, schema changes, watchlist writes, or failing live SQL recovery was verified. Vexcel imagery/tiles and sponsor entitlements remain unverified; a Matterport embed loaded, but its property match was not checked. The Gemini adapter has not made a live model call. No deployment was performed.

A separate fresh-production-build Chrome check with database configuration absent observed HTTP 500 responses on the home and listing routes with the safe retry copy and no internal error details in the response. It did not verify a failed SQL query, the retry interaction, or browser-side error-boundary navigation.

## 8. Suggested review order

Review from the smaller, documentation and display changes toward integrations that require unavailable credentials:

1. **Guide and public claims** — `README.md`, `docs/CHANGES.md`, `docs/DEMO.md`, and `web/lib/docs.test.ts`. Check that demo language, table figures, and live-verification caveats stay aligned.
2. **Score and economics** — `web/lib/model.ts`, `web/lib/modelCard.ts`, `data/model/risk_model.json`, and their tests. Check floor rounding, band thresholds, held-out shares, and formula inputs.
3. **Evidence rules and fixtures** — `web/lib/signals.ts`, `web/lib/caseStudies.ts`, `web/lib/checks.ts`, `data/signals/`, and `docs/EVIDENCE_SOURCES.md`. Check scope matching, publication/event dates, outcome types, and retrospective limits.
4. **Public pages and storage** — `web/app/**/page.tsx`, `web/lib/publicStore.ts`, and page tests. Check source attribution, empty/unscored states, as-of behavior, and visitor-scoped demo storage.
5. **Workspace and source checks** — `web/app/workspace/`, `web/lib/workspace*.ts`, `web/lib/sourceMonitor*.ts`, and `web/app/api/sources/check/`. Check saved-state preservation, baseline/change semantics, manual review, and failure copy.
6. **Request handlers** — `web/lib/requestBody.ts`, `web/app/api/watchlist/`, `web/app/api/evidence/`, and `web/app/api/investigate/`. Check request bounds, origin checks, cookie lifecycle, and fixed error responses before storage or fetches.
7. **Database and sponsor proxies** — `web/lib/db.ts`, `web/lib/env.ts`, `web/lib/vexcelProxy.ts`, `web/app/api/vexcel/`, and route tests. Check lazy configuration, ID lookup, query/request bounds, redirect policy, and cache behavior.
8. **Framework and dependency changes** — `web/package.json`, `web/package-lock.json`, and `web/next.config.ts`. Check version overrides and build configuration against the documented runtime.

## 9. Known open items

- The model uses 102 Texas projects (16 stopped, 86 under construction), with repeated cross-validation predictions on a small cohort. A 0.70 ± 0.15 ROC AUC is an early signal, not evidence of generalization. The score is not calibrated; features use today’s snapshot, and the labels describe stopped rather than delayed projects. Larger, time-separated and geographically independent evaluation is still needed before relying on predictive performance.
- The evidence fixture and case table were assembled retrospectively. The evidence rule is not statistically validated, and absent records do not establish absence of risk.
- Tracker label reuse terms and some source/sponsor redistribution rights are unconfirmed. Public-mode availability does not grant rights to republish tracker or sponsor data.
- Public watchlist and intake state is process-local and ephemeral. Visitor cookies are resettable; they do not supply durable identity, shared rate limits, or multi-instance persistence.
- The Vexcel 3D child-query schema and provider redirect behavior are unverified. Generic limits may reject legitimate requests, and cross-host redirects are intentionally refused until the contract is confirmed.
- Optional evidence intake and investigator features are local demonstrations. Their bounded process-local limits are not suitable as the only abuse controls for a public deployment.
- Local database reads have been checked. Production configuration, sponsor credentials, database write/failure checks, durable storage, access controls, and deployment review remain outstanding.
