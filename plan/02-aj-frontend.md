# 02 — AJ: Frontend

You build every screen and you present the pitch.

**Your folder:** `web/` only. **Your branch:** `lane/frontend`.

## Read this first (same in every lane file)

**Product.** Groundwork: a listings site where a business searches for land to build an AI data center on and gets, for each prospect, a Buy / Maybe / Pass verdict, the most it's worth paying, the ten-year cost, the deal risks, and an agent-written investment memo. Markets and orbit are context on a separate tab.

**Schedule (Eastern).** Build the demo table in `00-overview.md` top to bottom.

| Phase | When | Goal | Gate |
|-------|------|------|------|
| 0 | Sat now → 2 AM | Kickoff, skeleton, mocks, keys | 0: everyone runs web + API on mocks |
| 1 | Sat 2 → 5 AM | Screens on mocks, formulas coded, sponsor data opened | A: search → prospects with model numbers (sample data) |
| — | Sat 5 → 9 AM | Sleep in two shifts | — |
| 2 | Sat 9 AM → 1 PM | Real CoStar + Vexcel data, verdict, prospect page | B: demo rows 2–4 and 6 on real data |
| 3 | Sat 1 → 6 PM | Agent memo, MongoDB, Tiger history, watchlist, Markets | C: memo for a Houston prospect from the UI |
| 4 | Sat 6 → 11 PM | Vultr, domain, Solana, polish | D: full demo on the public URL from a phone |
| 5 | Sat 11 PM → Sun 3 AM | Freeze: bugs only | E: release candidate tagged |
| 6 | Sun 3 → 7:30 AM | README, video, Devpost, rehearse | Submitted by 7:30. Hard stop 8:00 |

**Rules for everyone.**

1. Sponsor data (CoStar, Vexcel, Matterport) never goes in git. It lives in `data/private/` and MongoDB.
2. No secrets in git. No sponsor keys in the browser, except the Matterport SDK key.
3. Unknown is `null` and shows as "Unknown". Never invent a value.
4. Every number carries a tag: `reported`, `modeled`, `assumed`, `sample`.
5. Numbers come from Marvin's formulas. The agent quotes them; it never makes them up.
6. A saved memo is never shown as live. It shows its timestamp and a "Saved" label.
7. Only edit your own folders. Need a change elsewhere? Ask the owner.
8. Blocked 30 minutes on a data source? Use a labeled sample and move on.
9. Hackathon rules: public repo, 85% of code written this weekend, credit every library, don't embellish, be able to explain your own code.
10. We code in Claude Code. We do not enter SpaceXSI.

## What you depend on

| You need | From | Until it exists |
|----------|------|-----------------|
| Mock JSON files in `/mocks` | Allen, at kickoff | Nothing; this is first |
| Live routes | Allen, announced one at a time | Stay on the mock for that route |
| Real sponsor fields | Noah's report by 5 AM | Treat every `costar`, `vexcel`, `matterport` field as possibly `null` |
| Domain | Noah, by 6 PM | Use the host's default URL |

## Pages

| Route | Page | Demo row |
|-------|------|----------|
| `/` | Home: search bar | 2 |
| `/search` | Prospect listings: cards + map | 3 |
| `/parcels/[id]` | Prospect page: image, verdict, investment, memo, Solana | 4, 5, 6 |
| `/markets` | Regions + orbit, sliders, break-even | 7 |
| `/markets/[id]` | One market or orbit in detail | 7 |
| `/watchlist` | Saved items and what changed | 8 |

Build them in that order.

## Phase 0 — Setup (now → 2 AM)

### 1. Kickoff

1. Add Allen, Marvin, and Noah as collaborators on the repo with write access. Turn on Settings → Branches → require a pull request for `main`.
2. Join the contract review. Tick the sign-off.
3. Connect Claude Code to ChatOverflow (5 minutes).

### 2. Scaffold (after Allen pushes the skeleton)

1. `git pull`, then `git checkout -b lane/frontend`.
2. `npx create-next-app@latest web --typescript --tailwind --app --eslint`
3. `cd web && npm i maplibre-gl recharts clsx react-markdown`
4. `web/.env.local`: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` and `NEXT_PUBLIC_USE_MOCKS=1`.
5. Push the scaffold through a pull request straight away.

### 3. Shared pieces

1. `lib/types.ts`: one TypeScript type per shape in `01-contract.md`. Copy field names exactly from the mock files.
2. `lib/api.ts`: one function per endpoint: `prospects`, `verdict`, `investigate`, `getRun`, `attest`, `verify`, `rank`, `breakdown`, `getWatchlist`, `addWatch`, `removeWatch`, `history`.
   1. With `NEXT_PUBLIC_USE_MOCKS=1`, each returns the matching file from `/mocks` after a 300 ms delay.
   2. Otherwise it calls the API with a 15-second timeout and throws a typed error on a non-200.
   3. Every call sends `X-Client-Id` from localStorage (create with `crypto.randomUUID()` if missing).
3. `lib/format.ts`: `money()` ($1.2B, $340M, $12,400), `bigNumber()` (87.6M), `pct()`.
4. `lib/search.ts`: read and write the search state in the URL query string (`mw`, `year`, `priority`, `market`, `budget`, plus slider values). Every page reads it from there, so refresh, back, and shared links work.
5. `components/shell/TopNav.tsx`: product name, links to Prospects, Markets, Watchlist (with a count badge).
6. `components/shell/Num.tsx`: takes a Num object. Renders the formatted value, the unit, and a small muted tag for its `kind`. `null` renders "Unknown". Hovering the tag shows the source.
7. `components/shell/VerdictBadge.tsx`: Buy (green), Maybe (amber), Pass (red). Used on cards, the prospect page, memos, and the watchlist.
8. Look: light background, one accent color, Inter via `next/font`. Put colors in `tailwind.config` as named tokens.

Done when (Gate 0): `npm run dev` runs and `prospects()` returns the mock.

## Phase 1 — Search and listings on mocks (2 → 5 AM)

### 4. Search bar (`components/search/SearchBar.tsx`, home page)

1. Five fields in one row:
   1. **How big?** Small 10 MW, Medium 50 MW, Large 100 MW, Huge 500 MW. Show the MW under each label.
   2. **Ready by?** Year dropdown, 2027–2035.
   3. **What matters most?** Lowest cost, Fastest to build, Lowest community impact, Balanced.
   4. **Where?** Houston, Los Angeles, Both.
   5. **Budget (optional).** Maximum land price.
2. "Advanced" toggle reveals a raw MW input. Validate: number, greater than 0, at most 2000. Show the error under the field and keep the value.
3. Helper under "How big?": "IT power is the electricity the chips use. A large AI campus is around 100 MW."
4. Search navigates to `/search` with the state in the query string.
5. Home page: the one-line pitch, then the search bar, pre-filled with Large, 2029, Lowest cost, Both.
6. `/demo` redirects to the exact pre-filled search URL used in the pitch.

### 5. Listings page (`app/search/page.tsx`)

1. Read the search state, call `prospects()`.
2. Layout: compact search bar on top; cards in a scrolling left column (about 45%); sticky map on the right.
3. Above the cards: count ("24 prospects"), filter chips for verdict and for land or building, and a sort menu (investment score, max price, ten-year cost). Filtering and sorting happen in the browser.
4. Loading: six skeleton cards. Error: message plus Retry. Empty: "No prospects match. Try both markets or a larger budget."

### 6. Prospect card (`components/prospects/ProspectCard.tsx`)

1. Aerial thumbnail (`thumbnail_url`, plain `<img>` against the API; grey box on error).
2. Address, market, acres, asking price (or "Price unknown").
3. `VerdictBadge`, then "Buy up to $X per acre" from `max_price_usd_per_acre`.
4. Ten-year cost, the one-line `verdict_reason`.
5. A small "Preliminary" tag when `checks_complete` is false, with the tooltip "Aerial checks run when you open the prospect."
6. A red "Too small for 100 MW" tag when `fits_capacity` is false.
7. Heart button (wired in Phase 3; until then it toggles local state).
8. Clicking the card opens `/parcels/{parcel_id}` with the same query string.

### 7. Map (`components/prospects/ProspectMap.tsx`)

1. MapLibre with a free, keyless basemap style. Load it client-side only: `dynamic(() => import(...), { ssr: false })`.
2. One pin per prospect, colored by verdict.
3. Two buttons to fly to Houston or Los Angeles. Default view fits the pins.
4. Hovering a card highlights its pin and the reverse. Clicking a pin scrolls to its card.

Done when (Gate A): with mocks off, the search shows prospects from Allen's `/prospects`.

## Phase 2 — Prospect page (9 AM → 1 PM)

### 8. Prospect page (`app/parcels/[id]/page.tsx`)

Call `verdict(id, search state)`. Sections, top to bottom:

1. **Header.** Address, market, kind, heart, back link that keeps the query string.
2. **Image + verdict, side by side.**
   1. Left: aerial image (`vexcel.ortho_image_url`). Toggle to oblique if present. On error: "Imagery unavailable".
   2. Right (`components/parcel/VerdictBlock.tsx`): large `VerdictBadge`, the `sentence`, and `max_price_usd_per_acre` as a `Num`.
3. **Checks** (`CheckList.tsx`). One row per check: pass / warn / fail / unknown icon, the detail text, and a chip naming the source (CoStar, Vexcel, WRI).
4. **Investment** (`InvestmentBlock.tsx`). Investment score, ten-year cost, cost per MW-year, facility power, annual energy, annual water, "water for about N homes". All `Num`.
5. **Compared with.** The next-best prospect with its ten-year cost and a link; then the orbit sentence from `vs_orbit`.
6. **Designs** (`DesignTable.tsx`). One column per cooling design, one row per metric. Highlight the cheaper total and the lower water use. Two Recharts bars below: cost (build versus running) and water. Every axis has a unit.
7. **Property record** (CoStar): type, land acres, building square feet, asking price, last sale, vacancy. `null` shows "Unknown".
8. **3D tour** (only when `matterport.model_id` is set). A button "Open 3D tour" loads an iframe to `https://my.matterport.com/show/?m={model_id}&play=1`. Confirm with Noah whether hackathon spaces need the SDK key appended. Show `floor_area_sf` beside it.
9. **Investigation** (Phase 3).
10. **Warnings** in an amber box; **Sources** in a side drawer.

Done when (Gate B): one Houston "Buy" and one LA "Pass" render fully on real data.

## Phase 3 — Memo, watchlist, Markets (1 → 6 PM)

Build against `mocks/run.running.json` and `mocks/run.done.json` until Marvin's agent is live.

### 9. Investigation (`components/memo/Investigation.tsx`)

1. Button "Investigate this site" calls `investigate(id)` and keeps the `run_id`. If `latest_memo_id` is set, show that memo first with a "Run again" button.
2. Poll `getRun(run_id)` every 2 seconds until `done` or `error`. Stop on unmount.
3. Step timeline while running: each step shows an agent chip (lead, land, power_water, community), the action, a data-layer chip from `layer` (CoStar, Vexcel, Matterport, Model, Web), the summary, and a spinner or check.
4. Disable the button during a run.
5. On `error`: the message and Retry. The rest of the page still works.

### 10. Memo view (`components/memo/MemoView.tsx`)

1. Header: `VerdictBadge` from `recommendation`, `max_price_usd_per_acre`, the summary, "Generated {time}", and a "Saved" label when `live` is false.
2. "Deal risks" list, then one card per section (`body_md` through `react-markdown`) with source chips.
3. "Open questions" in an amber box. "What changed since the last memo" if not empty.
4. Print stylesheet so Ctrl+P gives a clean one-page "Investment memo — {address}".

### 11. Watchlist (`lib/useWatchlist.ts`, `app/watchlist/page.tsx`)

1. `useWatchlist()`: loads once; exposes `items`, `isSaved(kind, ref_id)`, `toggle(kind, ref_id)`. Update the UI at once and roll back on failure.
2. Wire every heart button to it. Nav badge shows the count.
3. Page: one row per item with name, `VerdictBadge`, max price now versus before with an arrow, and the `changes` list with dates.
4. A sparkline per row from `history(ref_id, "max_price_usd_per_acre")`.
5. Banner when any item has changes: "1 change since your last visit". Say in the demo that email alerts are next.

### 12. Markets tab (`app/markets/page.tsx`)

1. Call `rank()` with the search state. Cards on the left (`components/markets/MarketCard.tsx`): rank, name, score, cost per MW-year, time to power, reason, badges, "Misses your 2029 deadline" when `meets_deadline` is false, "N prospects" link when `has_prospects`.
2. Low Earth Orbit is a card like the others, with a different accent.
3. Sliders (`AssumptionPanel.tsx`): launch cost ($100–$5,000 per kg), electricity price (50–200%), cooling efficiency (PUE 1.05–1.6), orbit hardware life (3–10 years). Values go in the URL. Debounce 150 ms, then call `rank()` again; keep the old cards dimmed until the new ones arrive.
4. Break-even banner under the sliders: `break_even.sentence`. Put a tick on the launch-cost slider at the break-even value. If it is `null`: "Orbit does not beat {top market} at any launch price under these assumptions."
5. Re-rank animation (cut first if behind): key cards by `option_id` and animate position changes; show ▲ or ▼ beside the rank for two seconds.
6. `app/markets/[id]/page.tsx`: call `breakdown()`. For a region: the `DesignTable` and charts plus the context strip (price, water stress, grid carbon, existing data centers). For `leo`: solar area, radiator area, launch mass, launch cost, replacements, and the warnings.

Done when (Gate C): Investigate shows live steps and a memo; a saved prospect shows one change; the Markets slider moves orbit.

## Phase 4 — Solana badge, deploy, polish (6 → 11 PM)

### 13. Attestation (`components/memo/Attestation.tsx`), build last

1. Show the memo's `digest_sha256`, shortened, with a copy button.
2. `not_attested`: button "Record on Solana" calls `attest(memo_id)`.
3. `pending`: spinner. `confirmed`: green "Recorded on Solana devnet" with a link to `explorer_url`. `failed` or `unavailable`: grey "Attestation unavailable".
4. "Verify" button calls `verify(memo_id)` and shows Verified, Mismatch, Not attested, or Unavailable. Unavailable is grey, never green.
5. The word "devnet" is always visible.

### 14. Deploy the frontend

1. Import the repo on Vercel, root `web`. Set `NEXT_PUBLIC_API_BASE_URL` to Allen's HTTPS API URL and `NEXT_PUBLIC_USE_MOCKS=0`.
2. Add Noah's domain in the host dashboard and give him the DNS records it asks for. Give Allen the final domain for CORS.

### 15. Polish

1. Every page at 375 px wide: cards stack, the map becomes a toggle.
2. Every page with the API off: a clear error, no white screen.
3. Refresh and direct link on every route.
4. Long addresses, large numbers, and `null` values don't break layouts.
5. The verdict, the max price, and the break-even line are readable from two meters.

Done when (Gate D): the whole demo runs on the public URL from a phone.

## Phase 5 and 6 — Freeze and pitch (Sat 11 PM → Sun 7:30 AM)

1. Bugs only after 11 PM.
2. Write the two-minute script from the demo table, one line per row. Cut it to 1:50.
3. Check every spoken number against `docs/assumptions.md` and the live site.
4. Rehearse five times on the public URL with a teammate driving.
5. Record the video with Noah (under 2 minutes). Confirm first with the CoStar team that their imagery may appear in it.
6. Review Noah's Devpost draft and README. Submit by 7:30 AM. Open the public project page and confirm the track, team, and repo link.
7. Prepare 30 seconds for each sponsor judge. The CoStar one is in `07-costar-track.md`.

## If you fall behind, cut in this order

Mobile layout → re-rank animation → Matterport tour → sparklines → Markets detail page → Solana badge.

Never cut: prospect cards, the verdict block, the checks list, the agent step timeline.

## If you're blocked

- Waiting on a route: stay on its mock.
- Waiting on images: a neutral placeholder (not a Vexcel image) labeled `sample`.
- Ahead of everyone: write the pitch script.
