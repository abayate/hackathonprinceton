"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPin = { id: string; name: string; lat: number; lng: number; color: string; text: string };

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

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = new maplibregl.Map({
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
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    return () => {
      map.current?.remove();
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
      markers.current.set(p.id, { m: new maplibregl.Marker({ element: node }).setLngLat([p.lng, p.lat]).addTo(m), node });
    }
    if (pins.length) {
      const b = new maplibregl.LngLatBounds();
      pins.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 50, maxZoom: 13, duration: 0 });
    }
  }, [pins]);

  useEffect(() => {
    markers.current.forEach(({ node }, id) => {
      const on = id === selectedId;
      node.style.background = on ? "#0f172a" : "white";
      node.style.color = on ? "white" : "#0f172a";
      node.style.zIndex = on ? "10" : "1";
      node.style.transform = on ? "scale(1.12)" : "";
    });
  }, [selectedId]);

  return <div ref={el} className="h-full w-full" />;
}
