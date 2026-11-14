# 03 — AJ: Frontend, part 2 (detail, parcel, report, watchlist)

## Read this first (same in every lane file)

**Build order.** Build the demo table in `00-overview.md` top to bottom. Nothing outside the table until every row works.

| # | When (ET) | Phase | Gate |
|---|-----------|-------|------|
| 1 | Fri now → 1 AM | Kickoff: scope, contract, repo, mocks, keys | Gate 0: all four run web + API locally on mocks |
| 2 | Sat 1 → 4 AM | Skeleton: screens on mocks, formulas coded, endpoints serve mocks, demo parcels picked | Gate A: search → `/rank` → cards with real model numbers |
| 3 | Sat 4 → 9 AM | Sleep in two shifts | — |
| 4 | Sat 9 AM → 1 PM | Real data, slider re-rank, break-even, parcel verdict | Gate B: demo rows 2–6 work without the agent |
| 5 | Sat 1 → 6 PM | Agent, report view, Tiger Data history, watchlist | Gate C: agent report for one Houston parcel from the UI |
| 6 | Sat 6 → 11 PM | Deploy (Vultr by 5 PM, DNS by 7 PM), polish | Gate D: full demo on the public URL from a phone |
| 7 | Sat 11 PM → Sun 3 AM | Freeze: bugs only, pre-generate reports, secrets audit | Gate E: release candidate tagged |
| 8 | Sun 3 → 7:30 AM | README, video, Devpost, rehearse | Submitted by 7:30. Hard stop 8:00 AM |

**Things everyone must know.**

1. **The agent is core, not an add-on.** CoStar scores 30% agentic depth and 30% data use; Amazon and LangChain are also agent-driven. It starts at 1 PM Saturday at the latest.
2. **CoStar is not a housing prize.** It wants an agent that combines at least two of CoStar, Vexcel, and Matterport and shows spatial or visual understanding. The parcel investigation is our entry.
3. **Sponsor data never goes in the repo.** CoStar is a file download from `/costar-keys`, not an API. It, Vexcel responses, and Matterport responses are hackathon-use only and live in `data/private/` (git-ignored). No sponsor keys in the browser except the Matterport SDK key.
4. **Sponsor data fields are unverified.** Nobody has seen the real CoStar columns or Vexcel attributes yet. Noah reports what exists in Phase 1. Until then, anything in the contract's `costar`, `vexcel`, and `matterport` blocks may change, and missing fields are `null` / "Unknown", never invented.
5. **Model constants are starting values.** Build cost per MW, water ratios, and orbit mass figures are marked `assumed` until Marvin confirms each from a source in `docs/assumptions.md`. Don't quote a number in the pitch that isn't confirmed.
6. **The deepagents API differs by version.** Copy argument names from the installed version's docs.
7. **Peri needs a real consult.** Business name, person's name and role, and evidence from this weekend. Replaying a cancelled project doesn't qualify. No consult, no entry.
8. **Rules that disqualify:** public repo created Nov 13–15; 85% of code written during the event; credit every library; one main track (Business & Enterprise); all four on Devpost with Discord names; no embellishing; everyone can explain their own code.
9. **Every number carries a tag:** `reported`, `modeled`, `assumed`, or `sample`.
10. **Never present a saved agent run as live.** Saved reports show their timestamp and a "Saved report" label.
11. **Blocked for 30 minutes on a data source?** Hardcode a labeled sample and move on.

**What this means for you (AJ).** Your parcel page and report view are what the CoStar, Amazon, and LangChain judges actually look at, so they are the highest-value screens after the ranking:

- The step timeline must make the agent's work visible: the plan, which subagent ran, which data layer each tool touched (label CoStar, Vexcel, Matterport by name).
- Show the aerial image and the CoStar facts side by side, with the agent's description of the image next to it. That is the "layers combined" and "visual understanding" evidence.
- Build the parcel page so any field in the `costar`, `vexcel`, and `matterport` blocks can be missing (point 4).
- The "Saved report" label and timestamp (point 10) are yours to render.
- Do not put a sample image from `web/public` into git if it came from Vexcel (point 3); use any free placeholder.

You own demo rows 5–7: the region detail page, the parcel page (aerial image, verdict, 3D tour), the agent report view, and the watchlist. You also own the app shell, the shared `Num` component, and the domain.

Your files: `web/app/layout.tsx`, `web/app/regions/`, `web/app/parcels/`, `web/app/watchlist/`, `web/components/shell/`, `web/components/detail/`, `web/components/parcel/`, `web/components/report/`, `web/components/watchlist/`, `web/lib/useWatchlist.ts`. AJ owns search and ranking.

## Phase 0 — Kickoff (now → 1:00 AM)

1. Join the kickoff and sign the contract.
2. Scaffold the app (commands in part 1).
3. App shell (`app/layout.tsx`, `components/shell/TopNav.tsx`).
   1. Top bar: product name on the left, "Watchlist" link with a count badge on the right.
   2. Pick the look once: light background, one accent color, one font (Inter via `next/font`). Put colors in `tailwind.config` as named tokens so both of you use the same ones.
4. `components/shell/Num.tsx` — used everywhere a number-with-provenance appears.
   1. Props: the `Num` object from the contract and an optional formatter.
   2. Renders the formatted value, the unit, and a small tag: `reported`, `modeled`, `assumed`, or `sample`, each a different muted color.
   3. `null` value renders "Unknown", never 0.
   4. Hovering the tag shows the source title if `source_id` is set.
5. `lib/format.ts`: `money()` ($1.2B, $340M, $12,400), `bigNumber()` (87.6M), `pct()`.
6. Connect your coding agent to ChatOverflow.

## Phase 1 — Skeleton on mocks (1:00 → 4:00 AM)

### 1. Region detail page (`app/regions/[id]/page.tsx`)

1. Read `id` and the query string; call `breakdown(id, req)`.
2. Header: region name, score, heart button, back link that preserves the query string.
3. **Design comparison table** (`components/detail/DesignTable.tsx`).
   1. One column per design (water-cooled, dry-cooled), one row per metric: facility power, annual energy, annual water (liters and gallons), CO2, build cost, annual running cost, total cost.
   2. Every cell is a `Num`.
   3. Highlight the cheaper total and the lower water use.
   4. One plain-language row: "Water for about N homes".
4. **Two charts** (`components/detail/CostChart.tsx`, `WaterChart.tsx`) with Recharts.
   1. Stacked bar: build cost versus running cost per design.
   2. Bar: annual water per design.
   3. Axis labels include units. No chart without a unit.
5. **Context strip:** electricity price, water stress label, grid carbon, number of existing data centers. All `Num`.
6. **Warnings box:** list `warnings` from the API in an amber box.
7. **Sources drawer:** a "Sources" button opens a side panel listing `sources` with links.
8. **Orbit variant:** when `id` is `leo`, hide the design table and show `components/detail/OrbitPanel.tsx`: solar area, radiator area, launch mass, launch cost, replacements, and the warnings. Add one comparison line: "Radiator area equals about N football fields".
9. Sliders: reuse `AssumptionPanel` from part 1 here.

### 2. Parcel list (bottom of the region page, Houston and LA only)

1. If the region has parcels, call `parcels(id)` and show a row of cards.
2. `components/parcel/ParcelCard.tsx`: thumbnail, address, acres, asking price, a Buy / Maybe / Pass badge (green, amber, red), the one-sentence reason.
3. Small map with a pin per parcel. Reuse the map component from part 1 with different props, or copy it if sharing is awkward.
4. For other regions show: "Site-level analysis is available in Houston and Los Angeles."

### 3. Parcel page (`app/parcels/[id]/page.tsx`)

1. Call `verdict(id, req)`.
2. Top: big aerial image on the left (`vexcel.ortho_image_url`, plain `<img>` pointing at our API), verdict block on the right.
3. Verdict block (`components/parcel/VerdictBlock.tsx`): large Buy / Maybe / Pass badge, the `sentence`, and `max_price_usd_per_acre` as a `Num`.
4. Checks list (`components/parcel/CheckList.tsx`): one row per check with a pass / warn / fail / unknown icon, the detail text, and which source it came from (CoStar, Vexcel, WRI).
5. CoStar facts table: property type, land acres, building square feet, last sale price, vacancy.
6. If there is an oblique image, add a toggle between top-down and oblique.
7. Image error fallback: a grey box that says "Imagery unavailable".

Done when: every page renders from mocks, and you can click search → region → parcel → back without a break.

## Phase 2 — Real data (9:00 AM → 1:00 PM)

1. Switch off mocks one page at a time as Allen announces each endpoint is live. Report any field that doesn't match the contract in the channel right away.
2. Fix whatever real data breaks: long addresses, nulls, huge numbers.
3. **Matterport embed** (`components/parcel/MatterportTour.tsx`), only on parcels where `matterport.model_id` is set.
   1. Simplest version: an iframe to `https://my.matterport.com/show/?m={model_id}&play=1` with `allow="fullscreen; xr-spatial-tracking"`. Confirm with Noah that hackathon spaces load this way; if they need the SDK key, add `&applicationKey=...` per the Showcase SDK docs.
   2. The SDK key is meant for the browser. The API key and token are not; they stay on the backend.
   3. Load it only when the user clicks "Open 3D tour" so the page stays fast.
   4. Show `matterport.floor_area_sf` next to it.

Done when (Gate B): rows 5 and 6 work on real data for one Houston "Buy" parcel and one LA "Pass" parcel.

## Phase 3 — Agent report and watchlist (1:00 → 6:00 PM)

### 4. Investigate button and live steps (`components/report/Investigation.tsx`)

1. Build this against `mocks/run.running.json` and `mocks/run.done.json` first.
2. An "Investigate this site" button on the parcel page calls `investigate(id)` and stores the `run_id`.
3. Poll `getRun(run_id)` every 2 seconds until `status` is `done` or `error`. Stop polling when the component unmounts.
4. While running, show the step timeline: each step as a row with the agent name as a colored chip (lead, land, power, community), the action, the summary, and a spinner or check.
5. Disable the button while a run is active so double clicks don't start two runs.
6. On `error`, show the message and a Retry button. The rest of the page keeps working.

### 5. Report view (`components/report/ReportView.tsx`)

1. Header: verdict badge, summary, "Generated {time}" and a "Saved report" label when `live` is false. Never hide that label.
2. One card per section with `body_md` rendered as markdown (`react-markdown`; credit it) and source chips that open the sources drawer.
3. "Open questions" list in an amber box.
4. "What changed since last report" list, if not empty.
5. A print stylesheet so Ctrl+P produces a clean one-pager. That is the export.

### 6. Watchlist (`lib/useWatchlist.ts`, `app/watchlist/page.tsx`)

1. `useWatchlist()` hook: loads `GET /watchlist` once, exposes `items`, `isSaved(kind, ref_id)`, `toggle(kind, ref_id)`. Update the UI immediately and roll back if the call fails.
2. Heart button component used on cards, region pages, and parcel pages.
3. Watchlist page: one row per item with name, current rank or verdict, the previous one, and an up or down arrow.
4. Under each row, the `changes` list with dates.
5. A small sparkline of `history` (Recharts `LineChart`, no axes).
6. Top-of-page banner when any item has a change: "1 change since your last visit". This is the on-screen alert; say in the demo that email is next.
7. Badge count in the top nav.

Done when (Gate C): clicking Investigate on a Houston parcel shows live steps and then a report, and a saved item shows one change.

## Phase 4 — Domain and polish (6:00 → 11:00 PM)

### 7. Domain (GoDaddy Registry prize)

1. Noah does steps 1–2 and hands you the domain. Check the MLH prize page for which domain endings qualify and how to redeem the free code. Do this before picking a name.
2. Register the domain.
3. Deploy the frontend (Vercel is fastest: import the repo, set root to `web`, set `NEXT_PUBLIC_API_BASE_URL` to Allen's HTTPS API URL, set `NEXT_PUBLIC_USE_MOCKS=0`).
4. Add the domain in the host's dashboard and create the DNS records it asks for. DNS can take a while; do this by 7 PM.
5. Give Allen the final domain so he can add it to CORS.
6. Screenshot the working site on the domain for the prize entry.

### 8. Polish

1. Every page at 375 px wide.
2. Every page with the API turned off: a clear error, no white screen.
3. Refresh and direct-link on every route.
4. Text is readable from two meters away on a laptop: the verdict badge and break-even line especially.
5. Remove dead links and placeholder text.

## Phase 5 — Freeze (Sat 11 PM → Sun 6 AM)

1. Bugs only.
2. Present the demo while a teammate drives. Rehearse five times.
3. Take six screenshots for Devpost: home, results, slider moved, region detail, parcel verdict with report, watchlist.
4. Record the video with Noah.

## If you're blocked

- Waiting on an endpoint: stay on its mock.
- Waiting on images: use a placeholder aerial JPEG in `web/public` and label it `sample`.
- Waiting on nothing: write the print stylesheet and take screenshots.
