# 08 — CoStar track: how Groundwork uses the data

The CoStar track ("Inside and Out: AI for the Built World", $1,500 / $500 / $250, finalists get interviews) is the sponsor track this product fits best. The whole land-prospect feature runs on their data. This file collects everything about it in one place.

## What they judge

| Weight | Criterion | What it means for us |
|--------|-----------|----------------------|
| 30% | Use of the data | Combine layers so the result needs both; not an image pasted next to a record |
| 30% | Agentic depth | The agent plans, calls tools, acts on what it finds; not a chat box over a property record |
| 25% | Customer usefulness | "Would a broker or analyst switch this on Monday?" |
| 15% | Demo and polish | Works end to end |

Their brief also asks for: at least two of the three layers, spatial and visual understanding (not only text), and something that looks like "the next feature of a platform the industry already uses". Their users are brokers, investors, lenders, developers, and appraisers, which is exactly our user.

## What the three layers are

| Layer | What it is | How we get it |
|-------|-----------|---------------|
| CoStar | A data extract (files, not an API) for Houston and Los Angeles: property, lease, and sale records; tenants, ownership, availability | `/costar-keys` in the track Discord gives a download link and password |
| Vexcel | Aerial imagery API from a lat/lon: property attributes, ortho and oblique images clipped to the parcel, custom element detection, semantic search over the surrounding area | Key from `/costar-keys`; tutorial PDF and Python quickstart on the hackathon site |
| Matterport | 3D scans of building interiors: rooms, floors, measurements via a GraphQL Model API; embeddable tours via the Showcase SDK | API key + token (basic auth) and SDK key from `/costar-keys` |

All of it is hackathon-use only. It lives in `data/private/` and MongoDB, never in git.

## How Groundwork uses each layer

| Layer | Used for | Where in the product |
|-------|----------|----------------------|
| CoStar | The prospect list itself: address, location, property type, land and building size, asking or last sale price, vacancy | Listings page, prospect page facts table, the `size` and `price` checks, market median price per acre |
| Vexcel | The aerial image; parcel attributes; distance to homes; flood or terrain flag | Listing thumbnails, prospect page image, the `homes_distance` and `flood_terrain` checks |
| Matterport | Interior floor area and room dimensions for existing buildings | "Convert this building" prospects: 3D tour embed and a rack-capacity estimate |

## Where the layers are combined (the 30% that matters most)

These are the points to show a CoStar judge. Each one needs two layers to work.

1. **The verdict.** Buy / Maybe / Pass uses CoStar for size and price and Vexcel for neighbors and flood. Remove either layer and the verdict can't be computed.
2. **The maximum price.** CoStar's price and the market median set what the land costs; Vexcel's flags and the model set what it's worth for a data center. The gap between them is the answer.
3. **Record versus reality.** The agent reads the CoStar record, then looks at the Vexcel image with Gemini vision, and reports where they disagree: a record that says vacant land with a structure visible on it, a listed acreage that doesn't match the visible lot, homes adjacent to a site the record calls industrial. This is the "we didn't know you could do that with our data" candidate.
4. **Retrofit capacity** (only if a suitable scan exists). CoStar gives the building's listed square footage; Matterport gives measured floor area and room dimensions. From those, estimate how many racks fit and therefore how many MW the building could host, then run the same verdict as for land.

## What the agent does (the other 30%)

One investigation of one prospect, visible step by step in the UI:

1. Writes a plan.
2. **Land subagent:** pulls the CoStar record, the Vexcel attributes, and the aerial image; describes what the image shows; pulls the Matterport summary if the prospect is a building; notes any record-versus-image mismatch.
3. **Power and water subagent:** runs the model for this site and both cooling designs; pulls water stress and grid context.
4. **Community subagent:** searches for local opposition, moratoriums, and zoning news; cites each URL.
5. Lead agent reads the three findings files, calls the verdict tool, and writes the investment memo: recommendation, maximum price, deal risks, open questions, sources.
6. On a later run for the same prospect, it loads the previous memo and reports what changed.

It acts, not just summarizes: it decides which tools to call, changes course when data is missing (no scan, no price), and produces a decision document.

## Who does what

| Person | CoStar-track work | In their file |
|--------|------------------|---------------|
| Noah | Get keys; open the extract; build the prospect list; Vexcel and Matterport clients with caching; report real fields by 5 AM; pick demo prospects | `05-noah-data.md` |
| Marvin | Verdict checks that use both layers; the agent, its land subagent, and the aerial image vision tool; record-versus-image mismatch | `03-marvin-model-agent.md` |
| Allen | `POST /prospects`, verdict, and image proxy routes; storing prospects, runs, and memos; keeping keys off the browser | `04-allen-backend.md` |
| AJ | Listings page with aerial thumbnails; prospect page showing image and record side by side; step timeline labeling each data layer by name; Matterport tour embed | `02-aj-frontend.md` |

## Minimum to enter, and stretch

**Minimum (must work at Gate C):**

- Prospect list from the CoStar extract.
- Vexcel image and attributes on the prospect page.
- A verdict that uses both.
- An agent run that touches both layers and includes the image description.

**Stretch, in this order:**

1. Record-versus-image mismatch finding.
2. Matterport tour embed on one building prospect.
3. Rack-capacity estimate from the scan.
4. Vexcel semantic search or element detection for nearby substations or power lines, as an agent tool.

If no usable Matterport building exists, stay with CoStar plus Vexcel. Two layers used well beats three used as decoration.

## Open questions for the CoStar team

Ask in `#costar-group`, with `/ask-costar`, or at their table. Noah owns these.

1. Which field links a CoStar record to a Matterport space and to Vexcel coverage?
2. Which Vexcel attributes are available for our key (elevation, flood, neighboring structures)?
3. Are there Matterport scans of warehouses or industrial buildings in Houston or LA?
4. What are the rate limits on the Vexcel and Matterport keys?
5. May sponsor imagery appear in our Devpost screenshots and demo video? Get this answered before recording.

## The 30-second version for a CoStar judge

> A developer looking for data center land opens Groundwork, and every listing is a CoStar record with a verdict on it. Open one: this is the Vexcel aerial, this is the CoStar record, and the verdict needs both: the record says it's big enough and priced right, the image says it's 200 meters from homes. Click Investigate, and the agent pulls the record, reads the aerial image, checks the scan, and writes an investment memo with a maximum price. Here it caught that the record and the image disagree.

Only say the last sentence if the mismatch finding actually works.

## Before submitting to this track

- [ ] At least two layers used in one result, on the live site
- [ ] The agent's steps show which layer each tool touched
- [ ] No CoStar, Vexcel, or Matterport data in the git history
- [ ] No sponsor keys reach the browser (Matterport SDK key excepted)
- [ ] Screenshot and video permission confirmed with the CoStar team
- [ ] `docs/costar.md` describes what works, not what was planned
- [ ] Team name used in `/costar-keys` matches the Devpost submission
