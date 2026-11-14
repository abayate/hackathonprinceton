# Demo properties

Two properties were checked by hand on 2026-11-14 for the property-investment demo: one expected **Buy** in Houston and one expected **Pass** in Los Angeles. Neither verdict is final until the valuation engine (`web/lib/valuation.ts`) runs on them with `data/inputs/markets.json`.

This file records public-record facts only. CoStar listing values (asking price, CoStar lot size, freshness dates) live in Tiger `sites` and in `data/private/inputs/demo_properties.json`, which is gitignored. Vexcel images from the checks are cached under `data/private/cache/vexcel/demo_check/`.

| | Houston: expected Buy | Los Angeles: expected Pass |
|---|---|---|
| Site ID | `costar-238029` | `costar-755901` |
| Address | 5025 Jensen Dr, Houston, TX 77026 | 1601 S Perrino Pl, Los Angeles, CA 90023 |
| Building | Single-storey industrial warehouse, 48,600 SF, built 1951 | Single-storey industrial/manufacturing, ~70,565 SF, built 1969, renovated 2014 |
| Parcel(s) | HCAD 0660050000128, -129, -130, -131 | APN/AIN 5169-015-014 (regular fee parcel) |
| Parcel area (public record) | **1.00 ac** across four lots (V08) | **3.17 ac** (138,174 SF) (V07) |
| Assessed value 2026 | $1,878,537 market value, four accounts combined (V08) | $15,641,142 roll value: land $11,316,827, improvements $4,324,315 (V07) |
| Flood (FEMA NFHL) | Zone X **shaded**, 0.2% annual chance (V06) → watch | Zone X, minimal hazard (V06) |
| Water stress (Aqueduct) | Medium-High (20-40%) → watch | **Extremely High (>80%) → fail** |
| Electric utility | CenterPoint delivery, competitive retail (V11) | LADWP, assumed from City of LA parcel (V07) |
| Power on record | Heavy power flagged; no amperage recorded | 2,600 A at 480 V, 3-phase, 4-wire (≈2.2 MVA) |
| Zoning | City of Houston has no zoning ordinance; deed restrictions not checked | M3 (heavy industrial) |
| Nearest sensitive uses | Single-family home shares the rear lot line; YES Prep school campus within ~80 m on Jensen Dr | Industrial blocks and rail line on all sides |

The seven checks for both properties, as the engine reads them, are in [`data/inputs/demo_checks.json`](../data/inputs/demo_checks.json).

| Check | Houston | Los Angeles |
|---|---|---|
| Power | watch | watch |
| Water | watch | **fail** |
| Zoning | watch (deed restrictions unchecked) | pass |
| Opposition | watch | pass |
| Policy | pass | watch (not scored) |
| Land | watch | watch (tax-delinquent) |
| Labor | pass | pass |

## Availability

Both listings are **Active / For Sale** in the CoStar kit, and CoStar re-verified them in early November 2026 (Houston Nov 2, LA Nov 4). We could not open the live LoopNet pages from here (blocked), so **someone needs to open both listings in a browser before the demo** and check that the asking prices match the following:

- **Jensen Dr:** a LoopNet search snippet shows **$3,500,000**, which differs from the CoStar kit figure. It is listed for sale and lease (Cubework operates the building).
- **Perrino Pl:** a CommercialCafe snippet updated Jan 23, 2026 shows **$9,950,000**, which differs from the CoStar kit figure. A 2021 sale for about $14.45M appears in the public sale history, and LoopNet describes the building as ~65% leased.

Use the CoStar kit figure in the app (that is the sponsor dataset) and mention that public listings differ.

## Problems found

1. **Jensen Dr acreage.** CoStar says 1.27 ac; the four HCAD lots total 1.00 ac. Price per acre and land math must say which figure they use. Use the public-record 1.00 ac for land value, and note it.
2. **Jensen Dr neighbours.** A house adjoins the site and a school is ~80 m away. Neither fails a current check, but the community-opposition check and the memo should say so. Generator noise and permitting would be the first questions.
3. **Jensen Dr floodplain edge.** Shaded Zone X; a drainage ditch runs along the south edge (visible in the Vexcel ortho). Not a fail, but a watch for land and physical risk.
4. **Perrino Pl tax status.** The County Assessor shows the parcel **tax-delinquent, default year 2026**. That is a diligence flag for the memo, not a pricing input.
5. **Perrino Pl "condo" flag.** CoStar marks the building as a condo, but the Assessor shows one regular fee parcel. All four Matterport scans are titled "Suite A …". Treat it as one parcel and note the discrepancy.
6. **Perrino Pl price vs comparables.** Its asking price per acre is *below* the median of CoStar's LA industrial sale comps (private summary, n=8). The Pass must come from the failed water check and from electricity cost (California prices are ~3.3× Texas), not from "overpriced land".
7. **Perrino nearest metro.** Tiger `sites.nearest_metro` reads "El Paso" (1,124 km) for LA sites because the feature builder only knows Texas metros. LA sites are unscored, so it doesn't affect results, but don't show that field for California.

## Suggested model inputs (assumed)

- **IT load: 1.5 MW for both.** Perrino's existing 2,600 A / 480 V service is about 2.2 MVA. At a power factor of 0.95 that is about 2.05 MW of facility load, or about 1.7 MW of IT at PUE 1.2. Jensen has no amperage on record. Using the same load for both makes the comparison fair. Tag it **assumed**.
- **Ready-by:** the buildings exist, so this is a conversion, not a greenfield build. The utility service upgrade is the long pole and is not sourced.

## Sponsor checks (live keys, 2026-11-14)

| Check | Houston `costar-238029` | Los Angeles `costar-755901` |
|---|---|---|
| Vexcel ortho (`/v2/ortho/extract`, layer `urban`) | HTTP 200, JPEG, capture dated 01/2026 | HTTP 200, JPEG, capture dated 12/2025 |
| Vexcel obliques (north, east) | HTTP 200 both | HTTP 200 both |
| Vexcel 3D tileset (`/v2/3d/tileset`, zoom 13, `3d-cities`) | HTTP 200 JSON; collection `us-tx-houstonr2-2023` | HTTP 200 JSON; collection `us-ca-losangeles-downey-2020-2021` |
| Vexcel 3D child tileset + tile | zoom 15 tileset → zoom 17 tile, HTTP 200 binary | Same, HTTP 200 binary |
| Redirects | None; all responses direct from `api.vexcelgroup.com` | None |
| Matterport embed (`my.matterport.com/show`) | HTTP 200, no X-Frame-Options; model titled "5025 Jensen Dr" | HTTP 200; four models, all titled "Suite A …" |
| Matterport–property match | **Verified:** the model ID matches CoStar's own "48,000 SF Interior Tour" attachment for this property | Plausible (address matches the kit), not independently verified |

### Notes for the app

- Imagery framing and orientation were checked by eye; both orthos are centred on the right building.
- The 3D child tileset URIs carry `childAOI`, `collection` and `latest` parameters. They pass the current `validVexcelQuery` character and coordinate rules, but the full Next.js proxy path was not exercised end to end.
- The LA 3D mesh is from 2020–21, so it predates the rooftop solar seen in the 2025 ortho. Label 3D capture years in the UI.
- For LA, the app currently embeds "Suite A Second Floor" (`sites.matterport_model_id`). "Suite A Warehouse" is the better demo view. Its model ID is in the CoStar kit `commercial-properties.csv` for property 755901 and is not reproduced here.
