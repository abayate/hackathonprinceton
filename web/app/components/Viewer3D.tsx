"use client";

import { useEffect, useRef, useState } from "react";

// CesiumJS from the CDN (exact version), so Next doesn't have to bundle its workers.
const CESIUM = "https://cdn.jsdelivr.net/npm/cesium@1.123.0/Build/Cesium";

export type Pin = { id: string; name: string; lat: number; lng: number; color: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type C = any;
declare global {
  interface Window { Cesium?: C; CESIUM_BASE_URL?: string }
}

let loading: Promise<C> | null = null;
function loadCesium(): Promise<C> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (loading) return loading;
  window.CESIUM_BASE_URL = `${CESIUM}/`;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${CESIUM}/Widgets/widgets.css`;
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = `${CESIUM}/Cesium.js`;
    s.onload = () => resolve(window.Cesium);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return loading;
}

// Vexcel serves 3D cities as zoom-13 tilesets keyed by web-mercator tile.
function tileOf(lat: number, lng: number, z = 13) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n);
  return { x, y };
}

export default function Viewer3D({
  pins,
  focusId,
  onSelect,
  className = "h-full w-full",
}: {
  pins: Pin[];
  focusId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const viewer = useRef<C>(null);
  const loaded = useRef(new Map<string, Promise<unknown>>());
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState("Loading 3D…");
  onSelectRef.current = onSelect;

  // Create the viewer once.
  useEffect(() => {
    let destroyed = false;
    loadCesium().then((Cesium) => {
      if (destroyed || !el.current || viewer.current) return;
      Cesium.Ion.defaultAccessToken = "";
      const v = new Cesium.Viewer(el.current, {
        baseLayer: new Cesium.ImageryLayer(
          new Cesium.UrlTemplateImageryProvider({
            url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            credit: "© OpenStreetMap contributors",
            maximumLevel: 19,
          }),
        ),
        baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
        navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
        infoBox: false, selectionIndicator: false,
      });
      v.scene.skyAtmosphere.show = true;
      v.scene.globe.enableLighting = false;
      v.cesiumWidget.creditContainer.style.fontSize = "10px";
      const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
      handler.setInputAction((e: { position: unknown }) => {
        const picked = v.scene.pick(e.position);
        const id = picked?.id?.id;
        if (typeof id === "string") onSelectRef.current?.(id);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      viewer.current = v;
      setStatus("");
    }).catch(() => setStatus("3D failed to load"));
    return () => {
      destroyed = true;
      viewer.current?.destroy();
      viewer.current = null;
      loaded.current.clear();
    };
  }, []);

  // Pins.
  useEffect(() => {
    const v = viewer.current;
    const Cesium = window.Cesium;
    if (!v || !Cesium) return;
    v.entities.removeAll();
    for (const p of pins) {
      v.entities.add({
        id: p.id,
        name: p.name,
        position: Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 70),
        point: {
          pixelSize: p.id === focusId ? 20 : 13,
          color: Cesium.Color.fromCssColorString(p.color),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([p.lng, p.lat, 0, p.lng, p.lat, 70]),
          width: 2,
          material: Cesium.Color.WHITE.withAlpha(0.8),
        },
      });
    }
  }, [pins, focusId, status]);

  // Load the Vexcel 3D tile around the focused site and fly there.
  useEffect(() => {
    const v = viewer.current;
    const Cesium = window.Cesium;
    const p = pins.find((x) => x.id === focusId) ?? pins[0];
    if (!v || !Cesium || !p) return;
    const t = tileOf(p.lat, p.lng);
    const key = `${t.x}/${t.y}`;
    if (!loaded.current.has(key)) {
      const promise = Cesium.Cesium3DTileset.fromUrl(
        `/api/vexcel/3d/tileset?zoom=13&tile-x=${t.x}&tile-y=${t.y}&layer=3d-cities`,
        { maximumScreenSpaceError: 8 },
      ).then((ts: C) => {
        // Vexcel heights are ellipsoidal (ground ≈ -25 to -35 m here). Lift the mesh so the
        // ground sits on the basemap instead of under it.
        const lift = -(ts.root?.boundingVolume?.minimumHeight ?? -27);
        const c = Cesium.Cartographic.fromCartesian(ts.boundingSphere.center);
        const from = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, 0);
        const to = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, lift);
        ts.modelMatrix = Cesium.Matrix4.fromTranslation(Cesium.Cartesian3.subtract(to, from, new Cesium.Cartesian3()));
        v.scene.primitives.add(ts);
        return ts;
      }).catch(() => setStatus("No Vexcel 3D for this area"));
      loaded.current.set(key, promise);
    }
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(p.lng, p.lat - 0.0055, 420),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-38), roll: 0 },
      duration: 1.6,
    });
  }, [focusId, pins, status]);

  return (
    <div className={`relative ${className}`}>
      <div ref={el} className="absolute inset-0" />
      {status && (
        <div className="absolute inset-0 grid place-items-center bg-slate-900/60 text-sm font-medium text-white">{status}</div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white">
        3D: Vexcel Imaging
      </div>
    </div>
  );
}
