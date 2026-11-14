import * as maplibregl from "maplibre-gl";

// Next.js bundles this worker as a same-origin asset for both Turbopack and webpack.
maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

export { maplibregl };
