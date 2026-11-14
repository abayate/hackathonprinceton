# 02 — AJ: Frontend, part 1 (search and ranking)

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

**What this means for you (AJ).** You own the whole frontend alone: this file (search, ranking, sliders, break-even) and `03-aj-frontend-2.md` (region detail, parcel page, agent report, watchlist). Work in this order: part 1 Phases 0–1, part 2 Phase 1, part 1 Phase 2, part 2 Phases 2–3, then polish. If you fall behind, cut in this order: mobile layout, card animation, Matterport embed, sparklines. Never cut the break-even line, the parcel verdict, or the agent step timeline. Noah writes the README and Devpost draft; you present, so check every spoken number against `docs/assumptions.md`.

You own demo rows 1–4 and 8: the search bar, the ranked cards and map, the sliders, the orbit card, the break-even line. You also own the pitch, the README, and the Devpost.

Your files: `web/app/page.tsx`, `web/app/search/`, `web/components/search/`, `web/components/ranking/`, `web/lib/api.ts`, `web/lib/types.ts`. Part 2 covers everything under `web/app/regions/`, `web/app/parcels/`, `web/app/watchlist/`.

## Phase 0 — Kickoff (now → 1:00 AM)

1. Run the kickoff (45 min, all four).
   1. Read the demo table in `00-overview.md` aloud. Cut anything anyone thinks is not doable.
   2. Walk through `01-contract.md` endpoint by endpoint. Change field names now if anyone objects.
   3. Everyone ticks the sign-off box.
2. Scaffold the web app (20 min).
   1. `npx create-next-app@latest web --typescript --tailwind --app --eslint`
   2. `cd web && npm i maplibre-gl recharts clsx`
   3. Add `web/.env.local` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` and `NEXT_PUBLIC_USE_MOCKS=1`.
   4. You also write the layout shell, colors, and the `Num` component (details in part 2, Phase 0).
3. Write `web/lib/types.ts`.
   1. One TypeScript type per shape in the contract: `Num`, `Assumptions`, `RankRequest`, `RankResponse`, `RankResult`, `BreakEven`, and so on.
   2. Copy field names exactly from the mock files.
4. Write `web/lib/api.ts`.
   1. One function per endpoint: `rank(req)`, `breakdown(id, req)`, `parcels(id)`, `verdict(id, req)`, `investigate(id)`, `getRun(id)`, watchlist calls.
   2. If `NEXT_PUBLIC_USE_MOCKS=1`, each function imports the matching file from `/mocks` and returns it after a 300 ms delay.
   3. Otherwise it calls `fetch` on the real API with a 15-second timeout and throws a typed error on non-200.
   4. Attach `X-Client-Id` from localStorage on every call (create it with `crypto.randomUUID()` if missing).
5. Connect your coding agent to ChatOverflow (5 min) and remind the others.

Done when: `npm run dev` shows a page, and `rank()` returns the mock.

## Phase 1 — Skeleton on mocks (1:00 → 4:00 AM)

### 1. Search bar (`components/search/SearchBar.tsx`)

1. Three fields in a row, like a travel site.
   1. **How big?** Four buttons: Small 10 MW, Medium 50 MW, Large 100 MW, Huge 500 MW. Show the MW under each label. Selecting one sets `it_power_mw`.
   2. **Ready by?** A year dropdown, 2027–2035.
   3. **What matters most?** Four options: Lowest cost, Fastest to build, Lowest community impact, Balanced. Maps to `priority`.
2. An "Advanced" toggle that reveals a raw MW number input. Validate: number, greater than 0, at most 2000. Show the error under the field and keep the entered value.
3. One-line helper under "How big?": "IT power is the electricity the chips use. A large AI campus is around 100 MW."
4. The Search button navigates to `/search?mw=100&year=2029&priority=lowest_cost`. State lives in the URL so refresh and back work.
5. The home page (`app/page.tsx`) is the search bar centered with the one-line pitch above it. Pre-fill "Large, 2029, Lowest cost".

### 2. Results page (`app/search/page.tsx`)

1. Read the query params, build a `RankRequest`, call `rank()`.
2. Layout: compact search bar on top, cards in a scrolling left column (about 45% width), map on the right, sticky.
3. Loading state: six grey skeleton cards. Error state: a message and a Retry button. Empty state is not possible, skip it.

### 3. Region card (`components/ranking/OptionCard.tsx`)

1. Shows: rank number, name, score out of 100, cost per MW-year, time to power, the `reason` sentence, badges, a heart button.
2. If `meets_deadline` is false, show a red "Misses your 2029 deadline" tag.
3. If `has_parcels` is true, show "Site-level data available".
4. Orbit card: same component, different accent color and a small rocket or orbit icon. No separate component.
5. Clicking the card goes to `/regions/{option_id}` with the same query string (part 2).
6. The heart calls the watchlist API through the `useWatchlist()` hook (part 2, Phase 3). Until then it only toggles local state.

### 4. Map (`components/ranking/RankMap.tsx`)

1. MapLibre with a free style (for example the OpenFreeMap or Carto basemap style URL; no key needed). Center on the continental US.
2. One marker per region result, labeled with its rank. Orbit gets no marker; instead show a small fixed "Low Earth Orbit" chip in the map's top-right corner.
3. Hovering a card highlights its marker and the reverse. Clicking a marker scrolls to the card.
4. MapLibre must be loaded client-side only: `dynamic(() => import(...), { ssr: false })`.

Done when (Gate A): the search runs against Allen's real `/rank` and cards show Marvin's numbers. Flip `NEXT_PUBLIC_USE_MOCKS` to 0 to check.

## Phase 2 — Sliders and break-even (9:00 AM → 1:00 PM)

### 5. Assumption sliders (`components/ranking/AssumptionPanel.tsx`)

1. A panel above the cards with four sliders:
   1. Launch cost, $100–$5,000 per kg, default from the API response.
   2. Electricity price, 50%–200% multiplier.
   3. Cooling efficiency (PUE), 1.05–1.6.
   4. Hardware life in orbit, 3–10 years.
2. Slider values live in the URL too, so a state can be shared and rehearsed.
3. On change, debounce 150 ms, then call `rank()` again. Keep showing the old cards (slightly dimmed) until the new ones arrive; never flash a spinner.
4. Ask Marvin what `/rank` latency is. If it's above about 200 ms, ask Allen to cache region data in memory so only the formulas rerun.

### 6. Animated re-rank

1. Key each card by `option_id`.
2. When ranks change, animate the move. Simplest way: the FLIP technique (record each card's position before the update, after the update translate it back, then transition to zero). A library such as `framer-motion` with `layout` on each card does this in one prop; credit it in the README if used.
3. Show a small "▲2" or "▼1" next to the rank for two seconds after a change.

### 7. Break-even line (`components/ranking/BreakEvenBanner.tsx`)

1. A full-width banner under the sliders showing `break_even.sentence`.
2. Put a tick mark on the launch-cost slider at `break_even.launch_cost_usd_per_kg`, so the judge sees where orbit flips.
3. If the API returns `null` (orbit can never win under these assumptions), show "Orbit does not beat {top site} at any launch price under these assumptions."

### 8. Second break-even (only if rows 2–4 are solid)

Ask Marvin for "Site B overtakes Site A if power rises above Y cents per kWh" and show it as a second line.

Done when (Gate B): dragging the launch slider moves the orbit card and updates the sentence, with no console errors.

## Phase 3 — Report view and watchlist (1:00 → 6:00 PM)

Build part 2, Phase 3 during this block. The documents below now belong to Noah (see `06-noah-data.md`); you only review them before submission.

1. Write `README.md`.
   1. What it is, who it's for, one screenshot.
   2. How to run it locally (get the exact commands from Allen).
   3. Architecture in ten lines.
   4. **Attribution list:** every framework, library, and dataset with a link. This is a rules requirement.
   5. "What we built this weekend" versus "what we used". Be exact.
   6. Limitations: screening tool, modeled numbers, linear orbit model, two cities for parcels.
2. Write `docs/assumptions.md` (Marvin and Noah): every constant, its value, its source, its `kind`.
3. Write the Amazon track doc (`docs/amazon.md`): target user, use case, how the agent reasons, plans, acts, and adapts (the watchlist re-investigation is the "adapts" part).
4. Write the CoStar track note (`docs/costar.md`): which layers are used, where they are combined, what the agent does with them.
5. Peri check: if anyone gets a real consult at the 11 AM career fair, record the business, name, role, and a photo or quote in `docs/peri.md`. If not, we don't enter.

## Phase 4 — Polish (6:00 → 11:00 PM)

1. Check the search and results pages at 375 px wide. Cards stack; map collapses to a toggle.
2. Long names, big numbers, and null values don't break the card. Format money as `$1.2B`, `$340M`.
3. Keyboard: tab through search fields, Enter submits.
4. Add a `/demo` route that redirects to the exact pre-filled search URL used in the pitch.

## Phase 5 — Submission (Sat 11 PM → Sun 7:30 AM)

1. Write the two-minute script from the demo table, one line per row. Time it. Cut words until it is 1:50.
2. Rehearse five times on the public URL with a teammate driving. Fix whatever stumbles.
3. Record the optional video (screen recording plus voice, under 2 minutes), upload to YouTube as unlisted.
4. Devpost (Noah drafts it by 3 AM; you review and submit by 7:30 AM):
   1. Business & Enterprise as the only main track.
   2. Tick each sponsor track only if its feature actually works on the public URL.
   3. All four members added. Discord usernames added.
   4. Public GitHub link. Open it in a private window to confirm it is public.
   5. Description sections: problem, what it does, how we built it, what's real versus simplified, attributions, what's next.
5. "What's next" slide content: any-parcel search, text search over imagery, rack capacity from Matterport scans, email alerts, more regions.
6. Prepare a 30-second add-on for each sponsor judge (CoStar: the layers and the agent; Amazon: every-day use; LangChain: plan, subagents, files).

## If you're blocked

- Waiting on `/rank`: stay on mocks and build the slider and animation.
- Waiting on nothing: write the README and the script.
