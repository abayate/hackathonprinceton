"use client";

import { useEffect, useRef, useState } from "react";
import { maplibregl } from "@/lib/maplibreClient";
import type { Candidate } from "@/lib/workspaceTypes";
import "maplibre-gl/dist/maplibre-gl.css";

export default function SpatialMap({ candidates, selectedId, onSelect }: { candidates: Candidate[]; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<maplibregl.Map | null>(null);
  const markers = useRef<{ id: string; marker: maplibregl.Marker; button: HTMLButtonElement }[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map | null = null;
    try {
      map = new maplibregl.Map({ container: container.current, center: [-99.2, 31.4], zoom: 5,
        style: { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.65, "raster-brightness-max": 0.97 } }] } });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      instance.current = map;
    } catch (error) {
      console.error("Workspace map could not initialize", error);
      setUnavailable(true);
    }
    return () => { map?.remove(); instance.current = null; };
  }, []);

  useEffect(() => {
    const map = instance.current;
    if (!map) return;
    markers.current.forEach(({ marker }) => marker.remove());
    const located = candidates.filter((candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng));
    markers.current = located.map((candidate) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gw-map-marker";
      button.textContent = "";
      button.title = candidate.name;
      button.setAttribute("aria-label", `Show ${candidate.name}`);
      button.setAttribute("aria-pressed", String(candidate.id === selectedId));
      button.onclick = () => onSelectRef.current?.(candidate.id);
      const marker = new maplibregl.Marker({ element: button }).setLngLat([candidate.lng, candidate.lat]).addTo(map);
      return { id: candidate.id, marker, button };
    });
    if (located.length) {
      const bounds = new maplibregl.LngLatBounds();
      located.forEach((candidate) => bounds.extend([candidate.lng, candidate.lat]));
      map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 0 });
    }
    // Focus changes style markers without refitting the user's map position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  useEffect(() => {
    markers.current.forEach(({ id, button }) => button.setAttribute("aria-pressed", String(id === selectedId)));
  }, [selectedId]);

  return unavailable ? <div className="gw-map-loading" role="status">Map unavailable in this browser. Every proposal is still available in the list.</div> : <div className="gw-map-inner" ref={container} />;
}
