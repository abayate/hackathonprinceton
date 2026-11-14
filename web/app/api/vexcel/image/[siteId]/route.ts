import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { cacheDir, env } from "@/lib/env";
import { listingPoint } from "@/lib/listings";

// Real Vexcel imagery of a listing. The key stays on the server; images are cached on disk.
const VIEWS: Record<string, { endpoint: string; productType?: string }> = {
  ortho: { endpoint: "ortho/extract" },
  north: { endpoint: "oriented/extract", productType: "oblique-north" },
  south: { endpoint: "oriented/extract", productType: "oblique-south" },
  east: { endpoint: "oriented/extract", productType: "oblique-east" },
  west: { endpoint: "oriented/extract", productType: "oblique-west" },
};
const SIZES: Record<string, string> = { thumb: "640,480,fill", full: "1600,1200,fill" };

export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const url = new URL(req.url);
  const view = VIEWS[url.searchParams.get("view") ?? "ortho"] ? (url.searchParams.get("view") ?? "ortho") : "ortho";
  const size = SIZES[url.searchParams.get("size") ?? "thumb"] ? (url.searchParams.get("size") ?? "thumb") : "thumb";

  const file = path.join(cacheDir("vexcel"), `${siteId.replace(/[^a-z0-9-]/gi, "")}_${view}_${size}.jpg`);
  if (fs.existsSync(file)) return image(fs.readFileSync(file));

  const site = await listingPoint(siteId);
  if (!site) return NextResponse.json({ detail: "unknown site" }, { status: 404 });

  // Frame the lot: roughly 1.6x the side of a square lot, between 160 m and 700 m.
  const side = site.lot_acres ? Math.sqrt(site.lot_acres * 4046.86) * 1.6 : 220;
  const meters = Math.round(Math.min(700, Math.max(160, side)));
  const v = VIEWS[view];
  const q = new URLSearchParams({
    layer: "urban",
    wkt: `POINT(${site.lng} ${site.lat})`,
    "bbox-dimensions": `${meters},${Math.round(meters * 0.75)}`,
    "destination-dimensions": SIZES[size],
    "image-format": "jpeg",
  });
  if (v.productType) q.set("product-type", v.productType);

  const res = await fetch(`https://api.vexcelgroup.com/v2/${v.endpoint}?${q}`, {
    headers: { "X-API-KEY": env("VEXCEL_API_KEY") },
    cache: "no-store",
  });
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) {
    return NextResponse.json({ detail: `Vexcel returned ${res.status}` }, { status: res.status === 403 ? 404 : 502 });
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return image(buf);
}

function image(buf: Buffer) {
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400, immutable" },
  });
}
