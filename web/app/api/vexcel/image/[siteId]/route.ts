import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { cacheDir, env } from "@/lib/env";
import { listingPoint } from "@/lib/listings";
import { isPublicDataMode } from "@/lib/dataMode";
import { fetchVexcel, vexcelErrorDetail } from "@/lib/vexcelProxy";

// Real Vexcel imagery of a listing. The key stays on the server; images are cached on disk.
const VIEWS: Record<string, { endpoint: string; productType?: string }> = {
  ortho: { endpoint: "ortho/extract" },
  north: { endpoint: "oriented/extract", productType: "oblique-north" },
  south: { endpoint: "oriented/extract", productType: "oblique-south" },
  east: { endpoint: "oriented/extract", productType: "oblique-east" },
  west: { endpoint: "oriented/extract", productType: "oblique-west" },
};
const SIZES: Record<string, string> = { thumb: "640,480,fill", full: "1600,1200,fill" };
const VALIDATION_TTL_MS = 60_000;
const MAX_VALIDATED_IDS = 200;
type ListingPoint = NonNullable<Awaited<ReturnType<typeof listingPoint>>>;
let verifiedPoints = new Map<string, { point: ListingPoint; expiresAt: number }>();

async function verifiedListingPoint(siteId: string): Promise<ListingPoint | null> {
  const cached = verifiedPoints.get(siteId);
  if (cached) {
    const next = new Map(verifiedPoints);
    next.delete(siteId);
    if (cached.expiresAt > Date.now()) {
      next.set(siteId, cached);
      verifiedPoints = next;
      return { ...cached.point };
    }
    verifiedPoints = next;
  }
  const point = await listingPoint(siteId);
  if (!point) return null;
  const next = new Map(verifiedPoints);
  next.set(siteId, { point: { ...point }, expiresAt: Date.now() + VALIDATION_TTL_MS });
  if (next.size > MAX_VALIDATED_IDS) {
    const oldest = next.keys().next().value;
    if (oldest !== undefined) next.delete(oldest);
  }
  verifiedPoints = next;
  return { ...point };
}

export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  if (isPublicDataMode()) return NextResponse.json({ detail: "not available in public data mode" }, { status: 404 });
  const { siteId } = await params;
  if (!/^costar-[0-9]+$/.test(siteId)) return NextResponse.json({ detail: "unknown site" }, { status: 404 });
  const url = new URL(req.url);
  const requestedView = url.searchParams.get("view") ?? "ortho";
  const requestedSize = url.searchParams.get("size") ?? "thumb";
  const view = Object.prototype.hasOwnProperty.call(VIEWS, requestedView) ? requestedView : "ortho";
  const size = Object.prototype.hasOwnProperty.call(SIZES, requestedSize) ? requestedSize : "thumb";
  let temporaryFile: string | undefined;
  try {
    const site = await verifiedListingPoint(siteId);
    if (!site) return NextResponse.json({ detail: "unknown site" }, { status: 404 });

    const file = path.join(cacheDir("vexcel"), `${siteId}_${view}_${size}.jpg`);
    if (fs.existsSync(file)) return image(fs.readFileSync(file));

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

    const res = await fetchVexcel(`https://api.vexcelgroup.com/v2/${v.endpoint}?${q}`, env("VEXCEL_API_KEY"));
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) {
      await res.body?.cancel();
      return NextResponse.json({ detail: "Imagery unavailable." }, { status: res.status === 403 ? 404 : 502 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    temporaryFile = `${file}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryFile, buf);
    fs.renameSync(temporaryFile, file);
    temporaryFile = undefined;
    return image(buf);
  } catch (error) {
    if (temporaryFile) {
      try { fs.unlinkSync(temporaryFile); } catch { /* Best-effort cleanup; preserve the safe response. */ }
    }
    return NextResponse.json({ detail: vexcelErrorDetail(error) }, { status: 502 });
  }
}

function image(buf: Buffer) {
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400, immutable" },
  });
}
