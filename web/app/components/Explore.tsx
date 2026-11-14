"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { BAND_COLOR, economics, money, type Band } from "@/lib/model";
import HeartButton from "./HeartButton";
import type { MapPin } from "./PinMap";

const PinMap = dynamic(() => import("./PinMap"), { ssr: false });
const Viewer3D = dynamic(() => import("./Viewer3D"), { ssr: false });

export type Card = {
  site_id: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  property_type: string;
  lot_acres: number | null;
  building_sf: number | null;
  ceiling_ft: number | null;
  heavy_power: boolean | null;
  asking_price: number | null;
  water_stress_label: string | null;
  p_stopped: number | null;
  band: Band | null;
};

const BAND_TEXT: Record<Band, string> = { green: "Low risk", watch: "Watch", red: "High risk" };

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

export default function Explore({ cards, mw, saved }: { cards: Card[]; mw: number; saved: string[] }) {
  const [selected, setSelected] = useState<string | null>(cards[0]?.site_id ?? null);
  const [view, setView] = useState<"map" | "3d">("map");
  const listRef = useRef<HTMLDivElement>(null);
  const savedSet = useMemo(() => new Set(saved), [saved]);

  const pins: MapPin[] = useMemo(
    () => cards.map((c) => ({
      id: c.site_id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      color: BAND_COLOR[c.band ?? "none"],
      text: c.p_stopped == null ? "—" : `${Math.round(c.p_stopped * 100)}%`,
    })),
    [cards],
  );

  function pick(id: string) {
    setSelected(id);
    listRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div ref={listRef} className="grid content-start gap-x-5 gap-y-8 sm:grid-cols-2 lg:max-h-[calc(100vh-9.5rem)] lg:overflow-y-auto lg:pr-3">
        {cards.map((c) => {
          const e = economics(c.p_stopped, mw);
          const on = c.site_id === selected;
          return (
            <article key={c.site_id} data-id={c.site_id} onMouseEnter={() => setSelected(c.site_id)} className="group">
              <Link href={`/listings/${c.site_id}?mw=${mw}`} className="block">
                <div className={`relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-200 ring-offset-2 transition ${on ? "ring-2 ring-slate-900" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/vexcel/image/${c.site_id}?view=ortho&size=thumb`}
                    alt={`Aerial view of ${c.name}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute left-3 top-3 flex gap-1.5">
                    {c.band && (
                      <span className="rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold shadow-sm" style={{ color: BAND_COLOR[c.band] }}>
                        ● {BAND_TEXT[c.band]}
                      </span>
                    )}
                    {c.heavy_power && (
                      <span className="rounded-full bg-slate-900/85 px-2.5 py-1 text-xs font-semibold text-white">⚡ Heavy power</span>
                    )}
                  </div>
                  <div className="absolute right-3 top-3"><HeartButton projectId={c.site_id} saved={savedSet.has(c.site_id)} /></div>
                </div>
                <div className="mt-3 space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate font-semibold text-slate-900">{c.city}, {c.state} · {c.property_type}</h3>
                    {c.p_stopped != null && <span className="shrink-0 text-sm text-slate-700">{Math.round(c.p_stopped * 100)}% risk</span>}
                  </div>
                  <p className="truncate text-sm text-slate-500">{c.name}</p>
                  <p className="text-sm text-slate-500">
                    {[c.lot_acres && `${num(c.lot_acres)} acres`, c.building_sf && `${num(c.building_sf)} sf`, c.ceiling_ft && `${c.ceiling_ft} ft clear`].filter(Boolean).join(" · ") || "Size not reported"}
                  </p>
                  <p className="pt-1 text-sm text-slate-900">
                    {c.asking_price ? <><span className="font-semibold">{money(c.asking_price)}</span> asking · </> : null}
                    <span className="font-semibold">{money(e.expectedDelayCost)}</span>
                    <span className="text-slate-500"> delay risk at {mw} MW</span>
                  </p>
                </div>
              </Link>
            </article>
          );
        })}
        {!cards.length && <p className="text-slate-500">No sites match. Try fewer filters.</p>}
      </div>

      <div className="relative h-[55vh] overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-200 lg:sticky lg:top-[8.5rem] lg:h-[calc(100vh-10rem)]">
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 rounded-full bg-white p-1 text-sm font-semibold shadow-md ring-1 ring-slate-200">
          {(["map", "3d"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-1.5 transition ${view === v ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {v === "map" ? "Map" : "3D city"}
            </button>
          ))}
        </div>
        {view === "map" ? (
          <PinMap pins={pins} selectedId={selected} onSelect={pick} />
        ) : (
          <Viewer3D pins={pins} focusId={selected} onSelect={pick} />
        )}
      </div>
    </div>
  );
}
