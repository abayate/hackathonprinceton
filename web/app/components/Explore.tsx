"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { displayScore, economics, money, stoppedShareForBand, type Band } from "@/lib/model";
import type { BandOutcomes } from "@/lib/modelCard";
import HeartButton from "./HeartButton";
import BandBadge from "./BandBadge";
import PropertyImage from "./PropertyImage";
import type { MapPin } from "./PinMap";
import { VERDICT_STYLE, type PropertyValuation } from "./valuation";

const PinMap = dynamic(() => import("./PinMap"), { ssr: false });
const Viewer3D = dynamic(() => import("./Viewer3D"), { ssr: false });

export type Card = {
  site_id: string; name: string; city: string; state: string; lat: number; lng: number;
  property_type: string; lot_acres: number | null; building_sf: number | null; ceiling_ft: number | null;
  heavy_power: boolean | null; asking_price: number | null; water_stress_label: string | null;
  p_stopped: number | null; band: Band | null; valuation: PropertyValuation;
};
const num = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });
const askingPrice = (value: number | null) => value != null && Number.isFinite(value) && value > 0
  ? value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : null;

const perAcre = (value: number | null) => value == null ? null : `${value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}/acre`;

export function VerdictBadge({ valuation, size = "sm" }: { valuation: PropertyValuation; size?: "sm" | "lg" }) {
  const style = VERDICT_STYLE[valuation.verdict];
  return <span className={`inline-flex items-center gap-1.5 rounded-full font-bold text-white ${style.cls} ${size === "lg" ? "px-3.5 py-1.5 text-lg" : "px-2.5 py-0.5 text-xs"}`}>{style.label}{valuation.is_sample && <small className="rounded-full bg-white/25 px-1.5 text-[9px] font-semibold uppercase tracking-wide">Sample</small>}</span>;
}

function CardVerdict({ valuation }: { valuation: PropertyValuation }) {
  const ceiling = perAcre(valuation.max_price_usd_per_acre.value);
  return <div className="gw-card-verdict">
    <div className="gw-card-verdict-head"><VerdictBadge valuation={valuation} />{valuation.verdict !== "pass" && ceiling && <strong>Buy up to {ceiling}</strong>}</div>
    <p>{valuation.reasons[0]}</p>
    <dl><div><dt>Ten-year cost</dt><dd>{money(valuation.ten_year_cost_usd.value)}</dd></div><div><dt>Asking</dt><dd>{perAcre(valuation.asking_price_usd_per_acre.value) ?? "Unknown"}</dd></div></dl>
  </div>;
}

function ScreeningContext({ card, mw, bandOutcomes }: { card: Card; mw: number; bandOutcomes: BandOutcomes }) {
  const stoppedShare = stoppedShareForBand(card.band, bandOutcomes);
  const scenario = economics(stoppedShare, mw);
  return <details className="gw-property-screening"><summary><span>Screening context</span><BandBadge band={card.band} /></summary>
    <div>{card.p_stopped != null && <p><strong>Risk score {displayScore(card.p_stopped)}/100</strong></p>}
      {stoppedShare == null ? <p>No band outcome estimate for this site.</p> : <><p>{(stoppedShare * 100).toFixed(1)}% of tracked Texas data center projects scored in this band were stopped (cross-validation). Small sample; today&apos;s features.</p><p><strong>{money(scenario.expectedDelayCost)}</strong> delay exposure scenario at {num(mw)} MW.</p></>}
      {card.water_stress_label && <p>Regional water stress: {card.water_stress_label}.</p>}
      <p>The model band is context, not a purchase verdict. The dollar scenario is an assumption, not a forecast or valuation.</p><Link href="/evidence">Read model assumptions</Link>
    </div>
  </details>;
}

export default function Explore({ cards, mw, readyBy, saved, bandOutcomes, clearHref = "/" }: { cards: Card[]; mw: number; readyBy?: number; saved: string[]; bandOutcomes: BandOutcomes; clearHref?: string }) {
  const [selected, setSelected] = useState<string | null>(cards[0]?.site_id ?? null);
  const [view, setView] = useState<"map" | "3d">("map");
  const cardNodes = useRef(new Map<string, HTMLElement>());
  const savedSet = useMemo(() => new Set(saved), [saved]);
  const selectedId = cards.some((card) => card.site_id === selected) ? selected : cards[0]?.site_id ?? null;
  const selectedCard = cards.find((card) => card.site_id === selectedId);
  const pins: MapPin[] = useMemo(() => cards.filter((card) => Number.isFinite(card.lat) && Number.isFinite(card.lng) && Math.abs(card.lat) <= 90 && Math.abs(card.lng) <= 180).map((card) => ({
    id: card.site_id, name: card.name, lat: card.lat, lng: card.lng, color: VERDICT_STYLE[card.valuation.verdict].color,
    text: VERDICT_STYLE[card.valuation.verdict].label, ariaText: `sample verdict ${VERDICT_STYLE[card.valuation.verdict].label}`,
  })), [cards]);
  const pinIds = new Set(pins.map((pin) => pin.id));

  function pick(id: string) {
    setSelected(id);
    cardNodes.current.get(id)?.scrollIntoView({ behavior: "auto", block: "nearest" });
    cardNodes.current.get(id)?.focus({ preventScroll: true });
  }

  return <div className="gw-property-explore">
    <div className="gw-property-list">
      {cards.map((card) => {
        const price = askingPrice(card.asking_price);
        const on = card.site_id === selectedId;
        const detailHref = `/listings/${encodeURIComponent(card.site_id)}?mw=${mw}${readyBy ? `&ready=${readyBy}` : ""}`;
        return <article key={card.site_id} data-id={card.site_id} tabIndex={-1} ref={(node) => { if (node) cardNodes.current.set(card.site_id, node); else cardNodes.current.delete(card.site_id); }} onMouseEnter={() => setSelected(card.site_id)} onFocus={() => setSelected(card.site_id)} className={`gw-property-card ${on ? "gw-property-card-selected" : ""}`}>
          <div className="gw-property-photo"><Link href={detailHref} aria-label={`Open property record for ${card.name}`}><PropertyImage src={`/api/vexcel/image/${encodeURIComponent(card.site_id)}?view=ortho&size=thumb`} alt={`Aerial view of ${card.name}`} className="gw-property-thumbnail" /></Link><span className="gw-property-type">{card.property_type}</span><div className="gw-property-save"><HeartButton projectId={card.site_id} saved={savedSet.has(card.site_id)} /></div></div>
          <div className="gw-property-card-body"><p className="gw-property-location">{card.city}, {card.state}</p><h3><Link href={detailHref}>{card.name}</Link></h3>
            <CardVerdict valuation={card.valuation} />
            <div className="gw-property-price"><span>Asking price <small>Reported snapshot</small></span><strong>{price ?? "Not reported"}</strong></div>
            <dl className="gw-property-facts"><div><dt>Land</dt><dd>{card.lot_acres == null ? "Not reported" : `${num(card.lot_acres)} acres`}</dd></div><div><dt>Building</dt><dd>{card.building_sf == null ? "Not reported" : `${num(card.building_sf)} sq ft`}</dd></div>{card.ceiling_ft != null && <div><dt>Clear height</dt><dd>{num(card.ceiling_ft)} ft</dd></div>}</dl>
            {card.heavy_power && <p className="gw-property-power">Heavy power reported <span>Utility capacity unconfirmed</span></p>}
            <ScreeningContext card={card} mw={mw} bandOutcomes={bandOutcomes} />
            <div className="gw-property-card-actions"><Link href={detailHref}>Open property <span aria-hidden="true">→</span></Link>{pinIds.has(card.site_id) ? <button type="button" onClick={() => setSelected(card.site_id)} aria-pressed={on}>Locate on map</button> : <span>Map location unavailable</span>}</div>
          </div>
        </article>;
      })}
      {!cards.length && <section className="gw-property-empty"><h3>No properties match this search</h3><p>Try a smaller minimum acreage, include more property types, or remove the heavy-power filter. Unknown facts are not treated as matching a requirement.</p><Link className="gw-prospect-button" href={clearHref}>Clear property filters</Link></section>}
    </div>
    <aside className="gw-property-map" aria-label="Property locations">
      <div className="gw-property-map-heading"><div><strong>Explore the surroundings</strong><p>Pins show the sample verdict for each property.</p></div><div className="gw-property-map-toggle" aria-label="Property map view">{(["map", "3d"] as const).map((value) => <button type="button" key={value} onClick={() => setView(value)} aria-pressed={view === value}>{value === "map" ? "Map" : "3D city"}</button>)}</div></div>
      <div className="gw-property-map-canvas">{pins.length ? view === "map" ? <PinMap pins={pins} selectedId={selectedId} onSelect={pick} /> : <Viewer3D pins={pins} focusId={selectedId} onSelect={pick} /> : <div className="gw-property-map-empty">{cards.length ? "No valid map coordinates for these properties." : "Your matching property locations will appear here."}</div>}</div>
      <div className="gw-property-map-caption" aria-live="polite">{selectedCard ? <><div><span>Selected property</span><strong>{selectedCard.name}</strong><p>{selectedCard.city}, {selectedCard.state}</p></div><Link href={`/listings/${encodeURIComponent(selectedCard.site_id)}?mw=${mw}${readyBy ? `&ready=${readyBy}` : ""}`}>View record <span aria-hidden="true">→</span></Link></> : <p>Select a property to explore its location.</p>}</div>
      <p className="gw-property-map-note">3D city imagery depends on Vexcel coverage and service access. Imagery is context; parcel boundaries, terrain and site conditions need verification.</p>
    </aside>
  </div>;
}
