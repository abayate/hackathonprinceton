import { NextResponse } from "next/server";
import { env } from "@/lib/env";

// Streams Vexcel 3D Tiles (tileset.json + glTF tiles) to the browser without exposing the key.
// Child URIs in Vexcel tilesets are relative ("./tileset?…", "./tile?…"), so they resolve back here.
const ALLOWED = new Set(["tileset", "tile"]);

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const endpoint = path.join("/");
  if (!ALLOWED.has(endpoint)) return NextResponse.json({ detail: "not allowed" }, { status: 404 });

  const search = new URL(req.url).search;
  const res = await fetch(`https://api.vexcelgroup.com/v2/3d/${endpoint}${search}`, {
    headers: { "X-API-KEY": env("VEXCEL_API_KEY") },
    cache: "no-store",
  });
  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": res.ok ? "public, max-age=86400" : "no-store",
    },
  });
}
