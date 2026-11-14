import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isPublicDataMode } from "@/lib/dataMode";
import { fetchVexcel, reserveVexcelRequest, validVexcelFetchSite, validVexcelQuery, vexcelErrorDetail } from "@/lib/vexcelProxy";

const ALLOWED = new Set(["tileset", "tile"]);

// Child query schemas are unverified. Apply generic bounds without inventing a name allowlist.
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (isPublicDataMode()) return NextResponse.json({ detail: "not available in public data mode" }, { status: 404 });
  const { path } = await params;
  if (path.length !== 1 || !ALLOWED.has(path[0])) return NextResponse.json({ detail: "not allowed" }, { status: 404 });
  if (!validVexcelFetchSite(req.headers.get("sec-fetch-site"))) {
    return NextResponse.json({ detail: "cross-site request not allowed" }, { status: 403 });
  }
  const search = new URL(req.url).search;
  if (!validVexcelQuery(search)) return NextResponse.json({ detail: "invalid imagery query" }, { status: 400 });
  if (!reserveVexcelRequest()) return NextResponse.json({ detail: "imagery request limit reached" }, { status: 429 });
  try {
    const res = await fetchVexcel(`https://api.vexcelgroup.com/v2/3d/${path[0]}${search}`, env("VEXCEL_API_KEY"));
    if (!res.ok) {
      await res.body?.cancel();
      return NextResponse.json({ detail: "Imagery provider request failed" }, { status: res.status >= 400 ? res.status : 502 });
    }
    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ detail: vexcelErrorDetail(error) }, { status: 502 });
  }
}
