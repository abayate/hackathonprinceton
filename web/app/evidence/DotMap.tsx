"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapPin } from "@/app/components/PinMap";

// Small dots for many projects (statewide), drawn as a GeoJSON layer for speed.
export default function DotMap({ points, onSelect }: { points: MapPin[]; onSelect: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
        layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.7 } }],
      },
      center: [-99, 31.3],
      zoom: 4.6,
    });
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
        if (id) onSelect(String(id));
      });
      map.on("mouseenter", "pts", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "pts", () => (map.getCanvas().style.cursor = ""));
    });
    return () => map.remove();
  }, [points, onSelect]);
  return <div ref={el} className="h-full w-full" />;
}
