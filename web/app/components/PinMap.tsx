"use client";

import { useEffect, useRef, useState } from "react";
import { maplibregl } from "@/lib/maplibreClient";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPin = { id: string; name: string; lat: number; lng: number; color: string; text: string; ariaText?: string };

function stylePin(node: HTMLButtonElement, selected: boolean) {
  node.style.background = selected ? "#0f172a" : "white";
  node.style.color = selected ? "white" : "#0f172a";
  node.style.zIndex = selected ? "10" : "1";
  node.setAttribute("aria-pressed", String(selected));
}

// 2D map with Airbnb-style pills. Clicking a pill calls onSelect.
export default function PinMap({
  pins,
  selectedId,
  onSelect,
}: {
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, { m: maplibregl.Marker; node: HTMLButtonElement }>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    let instance: maplibregl.Map | null = null;
    try {
      instance = new maplibregl.Map({
        container: el.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [
            { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.6, "raster-brightness-max": 0.97 } },
          ],
        },
        center: [-95.37, 29.76],
        zoom: 9,
      });
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.current = instance;
    } catch (error) {
      console.error("Unable to initialize project map", error);
      if (instance) {
        try { instance.remove(); } catch (cleanupError) { console.error("Unable to clean up project map", cleanupError); }
      }
      setUnavailable(true);
      return;
    }
    const activeMarkers = markers.current;
    return () => {
      activeMarkers.forEach(({ m: marker }) => marker.remove());
      activeMarkers.clear();
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach(({ m: mk }) => mk.remove());
    markers.current.clear();
    for (const p of pins) {
      const node = document.createElement("button");
      node.textContent = p.text;
      node.title = p.name;
      node.style.cssText = `font:600 12px system-ui;padding:3px 9px;border-radius:9999px;background:white;color:#0f172a;border:2px solid ${p.color};box-shadow:0 2px 6px rgba(0,0,0,.25);cursor:pointer;white-space:nowrap`;
      node.onclick = () => onSelectRef.current?.(p.id);
      stylePin(node, p.id === selectedIdRef.current);
      const marker = new maplibregl.Marker({ element: node }).setLngLat([p.lng, p.lat]).addTo(m);
      node.setAttribute("aria-label", `Select ${p.name} on map, ${p.ariaText ?? (p.text === "—" || p.text === "Unscored" ? "risk score unavailable" : `risk score ${p.text}`)}`);
      markers.current.set(p.id, { m: marker, node });
    }
    if (pins.length) {
      const b = new maplibregl.LngLatBounds();
      pins.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 50, maxZoom: 13, duration: 0 });
    }
  }, [pins]);

  useEffect(() => {
    markers.current.forEach(({ node }, id) => {
      stylePin(node, id === selectedId);
    });
  }, [selectedId]);

  return unavailable
    ? <div className="grid h-full w-full place-items-center bg-slate-100 p-6 text-center text-sm text-slate-700" role="status">Map unavailable in this browser</div>
    : <div ref={el} className="h-full w-full" />;
}
