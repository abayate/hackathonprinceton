"use client";

import { useEffect, useRef, useState } from "react";
import { maplibregl } from "@/lib/maplibreClient";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapPin } from "@/app/components/PinMap";

// Small dots for many projects (statewide), drawn as a GeoJSON layer for speed.
export default function DotMap({ points, onSelect }: { points: MapPin[]; onSelect: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    let instance: maplibregl.Map | null = null;
    try {
      instance = new maplibregl.Map({
        container: el.current,
        style: {
          version: 8,
          sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
          layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.7 } }],
        },
        center: [-99, 31.3],
        zoom: 4.6,
      });
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    } catch (error) {
      console.error("Unable to initialize evidence map", error);
      if (instance) {
        try { instance.remove(); } catch (cleanupError) { console.error("Unable to clean up evidence map", cleanupError); }
      }
      setUnavailable(true);
      return;
    }
    const map = instance;
    map.on("load", () => {
      map.addSource("pts", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: points.map((p) => ({
            type: "Feature",
            properties: { id: p.id, name: p.name, color: p.color },
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          })),
        },
      });
      map.addLayer({
        id: "pts", type: "circle", source: "pts",
        paint: { "circle-radius": 5, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 },
      });
      map.on("click", "pts", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) onSelectRef.current(String(id));
      });
      map.on("mouseenter", "pts", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "pts", () => (map.getCanvas().style.cursor = ""));
    });
    return () => map.remove();
  }, [points]);
  return unavailable
    ? <div className="grid h-full w-full place-items-center bg-slate-100 p-6 text-center text-sm text-slate-700" role="status">Map unavailable in this browser</div>
    : <div ref={el} className="h-full w-full" />;
}
