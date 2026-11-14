"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPoint = { id: string; name: string; lat: number; lng: number; color: string; label: string };

export default function SiteMap({ points }: { points: MapPoint[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const router = useRouter();

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
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [-98.5, 31.2],
      zoom: 5,
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
    markers.current.forEach((mk) => mk.remove());
    markers.current = points.map((p) => {
      const dot = document.createElement("button");
      dot.title = `${p.name} · ${p.label}`;
      dot.style.cssText = `width:14px;height:14px;border-radius:9999px;background:${p.color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:pointer`;
      dot.onclick = () => router.push(`/sites/${p.id}`);
      return new maplibregl.Marker({ element: dot }).setLngLat([p.lng, p.lat]).addTo(m);
    });
    if (points.length) {
      const b = new maplibregl.LngLatBounds();
      points.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 40, maxZoom: 10, duration: 0 });
    }
  }, [points, router]);

  return <div ref={el} className="h-full w-full" />;
}
