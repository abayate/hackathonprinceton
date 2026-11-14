import Link from "next/link";
import { cookies } from "next/headers";
import { listListings, type ListingFilters } from "@/lib/listings";
import { watchlistIds } from "@/lib/sites";
import { getModelArtifact } from "@/lib/modelArtifact";
import { isPublicDataMode } from "@/lib/dataMode";
import { parseMinAcres, parseMw } from "@/lib/params";
import Explore, { type Card } from "./components/Explore";
import { parsePriority, parseReadyBy, READY_BY_YEARS, sortByPriority } from "./components/valuationView";
import { DEMO_MW, listingValuation } from "./components/listingValuation";
import "./prospects.css";

export const dynamic = "force-dynamic";
type SP = ListingFilters & { mw?: string; ready?: string; sort?: string };

function href(sp: SP, patch: Partial<SP>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...sp, ...patch })) if (value) query.set(key, value);
  return `/?${query}`;
}

function CatalogUnavailable() {
  return <main className="gw-prospects gw-catalog-unavailable">
    <div className="gw-prospect-intro"><div><h1>Find the next place to build.</h1><p>Explore land and buildings, examine the property record, and decide what deserves a closer look.</p></div><span className="gw-catalog-scope">Houston & Los Angeles</span></div>
    <section className="gw-catalog-boundary" aria-labelledby="catalog-status">
      <div className="gw-catalog-message"><span className="gw-availability">Public research available</span><h2 id="catalog-status">Property catalog unavailable</h2><p>This preview includes public Texas project research. The CoStar property catalog for Houston and Los Angeles has not been loaded here.</p><p>Asking prices and building records require the connected catalog. Aerial and 3D views also depend on sponsor service access. Tracked projects describe development activity; they are not properties offered for sale.</p><div className="gw-catalog-actions"><Link className="gw-prospect-button gw-prospect-primary" href="/projects">Explore project research</Link><Link className="gw-prospect-button" href="/workspace">Open research workspace</Link></div></div>
      <div className="gw-catalog-markets"><h3>Property markets</h3>{["Houston, Texas", "Los Angeles, California"].map((market) => <div key={market}><svg aria-hidden="true" viewBox="0 0 44 44" fill="none"><path d="M5 36h34M10 35V14l12-6 12 6v21M18 35V23h8v12M16 16h3m6 0h3" stroke="currentColor" strokeWidth="1.5" /></svg><span><strong>{market}</strong><small>Catalog not loaded</small></span></div>)}<p>Open project research to explore the public records available in this preview.</p></div>
    </section>
  </main>;
}

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const raw = await searchParams;
  if (isPublicDataMode()) return <CatalogUnavailable />;
  const market = raw.market === "la" || raw.market === "all" ? raw.market : "houston";
  const minAcres = parseMinAcres(raw.acres);
  const sp: SP = {
    ...(raw.market ? { market } : {}),
    ...(typeof raw.q === "string" && raw.q.trim() ? { q: raw.q.trim().slice(0, 200) } : {}),
    ...(["Industrial", "Flex", "Land"].includes(raw.type ?? "") ? { type: raw.type } : {}),
    ...(minAcres !== undefined ? { acres: String(minAcres) } : {}),
    ...(raw.power === "1" ? { power: "1" } : {}),
    ...(market !== "la" && ["green", "watch", "red"].includes(raw.band ?? "") ? { band: raw.band } : {}),
    ...(raw.mw ? { mw: String(parseMw(raw.mw)) } : {}),
    ...(raw.ready ? { ready: String(parseReadyBy(raw.ready)) } : {}),
    ...(raw.sort && parsePriority(raw.sort) !== "recommended" ? { sort: parsePriority(raw.sort) } : {}),
  };
  const mw = sp.mw ? parseMw(sp.mw) : DEMO_MW;
  const readyBy = parseReadyBy(sp.ready);
  const priority = parsePriority(sp.sort);
  const [listings, modelArtifact] = await Promise.all([listListings({ ...sp, market }), getModelArtifact()]);
  const clientId = (await cookies()).get("client_id")?.value;
  const saved = clientId ? await watchlistIds(clientId) : [];
  const cards: Card[] = sortByPriority(listings.map((listing) => ({
    site_id: listing.site_id, name: listing.name, city: listing.city, state: listing.state, lat: listing.lat, lng: listing.lng,
    property_type: listing.property_type, lot_acres: listing.lot_acres, building_sf: listing.building_sf, ceiling_ft: listing.ceiling_ft,
    heavy_power: listing.heavy_power, asking_price: listing.asking_price, water_stress_label: listing.water_stress_label,
    p_stopped: listing.p_stopped, band: listing.band,
    valuation: listingValuation(listing, mw),
  })), priority);
  const clearHref = href({ market, mw: String(mw), ...(sp.ready ? { ready: sp.ready } : {}) }, {});

  return <main className="gw-prospects">
    <header className="gw-prospect-intro"><div><h1>Property prospects</h1><p>Start with the land. Follow the facts. Find the questions worth asking.</p></div><Link href="/projects" className="gw-research-link">Explore project research <span aria-hidden="true">→</span></Link></header>
    <div className="gw-prospect-search">
      <nav className="gw-market-switch" aria-label="Property market">{[["houston", "Houston"], ["la", "Los Angeles"], ["all", "Both markets"]].map(([key, label]) => <Link key={key} href={href(sp, { market: key, ...(key === "la" ? { band: undefined } : {}) })} aria-current={market === key ? "page" : undefined}>{label}</Link>)}</nav>
      <form method="get" action="/" className="gw-property-filters">
        <input type="hidden" name="market" value={market} />
        <label className="gw-property-field gw-property-search"><span>Location or property</span><input type="search" name="q" defaultValue={sp.q ?? ""} maxLength={200} placeholder="Address, city or property name" /></label>
        <label className="gw-property-field"><span>Property type</span><select name="type" defaultValue={sp.type ?? ""}><option value="">All types</option>{["Industrial", "Flex", "Land"].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label className="gw-property-field"><span>Minimum acres</span><input type="number" name="acres" min="0" step="any" defaultValue={sp.acres ?? ""} placeholder="Any size" /></label>
        <label className="gw-property-field"><span>Workload <small>MW</small></span><input type="number" name="mw" min="1" max="5000" step="any" required defaultValue={mw} aria-describedby="workload-help" /></label>
        <label className="gw-property-field"><span>Ready by</span><select name="ready" defaultValue={String(readyBy)}>{READY_BY_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <label className="gw-property-field"><span>Sort by</span><select name="sort" defaultValue={priority}><option value="recommended">Recommended</option><option value="lowest_cost">Lowest ten-year cost</option><option value="verdict">Verdict: Buy first</option></select></label>
        <button type="submit" className="gw-prospect-button gw-prospect-primary">Apply search</button>
        <div className="gw-filter-secondary"><label className="gw-property-checkbox"><input type="checkbox" name="power" value="1" defaultChecked={sp.power === "1"} /><span>Reported heavy power</span></label>{market !== "la" && <label className="gw-band-filter"><span>Texas screening band</span><select name="band" defaultValue={sp.band ?? ""} aria-describedby="screening-band-help"><option value="">All bands</option><option value="green">Green</option><option value="watch">Watch</option><option value="red">Red</option></select></label>}<Link href={clearHref}>Clear property filters</Link></div>
      </form>
      <p id="workload-help" className="gw-workload-note">MW and ready-by year set the verdict, price ceiling and ten-year cost. Neither confirms available utility capacity or a connection date.</p>
      {cards.some((card) => card.valuation.sampleTainted) && <p className="gw-sample-banner" role="note"><strong>Sample inputs</strong> Verdicts come from the valuation engine, but some market inputs are still placeholders. Don&apos;t use them for a decision.</p>}
      {market !== "la" && <p id="screening-band-help" className="gw-workload-note">Selecting a screening band includes scored Texas properties only; unscored properties, including all LA properties, are excluded.</p>}
    </div>
    <div className="gw-property-results-heading"><div><h2>{listings.length} {listings.length === 1 ? "property" : "properties"} in {market === "la" ? "Los Angeles" : market === "all" ? "Houston & Los Angeles" : "Houston"}</h2><p>Property facts and asking prices from the CoStar snapshot. Availability and pricing need confirmation.</p></div><span>Reported property record</span></div>
    {(market === "la" || market === "all") && <p className="gw-market-note">The risk model is Texas-only, so LA sites are unscored.</p>}
    <Explore cards={cards} mw={mw} readyBy={sp.ready ? readyBy : undefined} saved={saved} bandOutcomes={modelArtifact.metrics.band_outcomes_oof} clearHref={clearHref} />
  </main>;
}
