import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isClientId, isWatchlistId } from "@/lib/params";
import { isPublicDataMode } from "@/lib/dataMode";
import { readJsonBody } from "@/lib/requestBody";

const COOKIE = "client_id";
const BODY_LIMIT = 1_024;

async function clientId(): Promise<{ id: string; isNew: boolean }> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  return isClientId(existing) ? { id: existing, isNew: false } : { id: crypto.randomUUID(), isNew: true };
}

function withCookie(res: NextResponse, id: string, isNew: boolean) {
  if (isNew) res.cookies.set(COOKIE, id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
}

async function updateWatchlist(req: Request, saved: boolean) {
  const origin = req.headers.get("origin");
  if (origin !== null) {
    try {
      const originUrl = new URL(origin);
      // Next may use an internal request URL behind a proxy; Host is the browser target.
      const host = req.headers.get("host") ?? new URL(req.url).host;
      if (!["http:", "https:"].includes(originUrl.protocol) || originUrl.host !== host) throw new Error("Origin mismatch");
    } catch {
      return NextResponse.json({ detail: "Update your watchlist from this site." }, { status: 422 });
    }
  }
  const bodyResult = await readJsonBody(req, BODY_LIMIT);
  if (!bodyResult.ok) {
    return NextResponse.json({ detail: "A valid JSON body is required" }, { status: 422 });
  }
  const body = bodyResult.value;
  const projectId = body !== null && typeof body === "object" && "project_id" in body ? body.project_id : undefined;
  if (!isWatchlistId(projectId)) {
    return NextResponse.json({ detail: "A valid project_id is required" }, { status: 422 });
  }
  try {
    const { id, isNew } = await clientId();
    if (isPublicDataMode()) {
      const { setPublicWatchlist } = await import("@/lib/publicStore");
      const exists = await setPublicWatchlist(id, projectId, saved);
      if (!exists) return NextResponse.json({ detail: "unknown project" }, { status: 404 });
      return withCookie(NextResponse.json({ saved }), id, isNew);
    }
    const sql = saved
      ? "INSERT INTO site_watchlist (client_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING"
      : "DELETE FROM site_watchlist WHERE client_id = $1 AND project_id = $2";
    await pool.query(sql, [id, projectId]);
    return withCookie(NextResponse.json({ saved }), id, isNew);
  } catch {
    // Do not log connection strings, query arguments, or sponsor identifiers.
    console.error("Watchlist persistence failed", { operation: saved ? "save" : "remove" });
    return NextResponse.json({ detail: "Watchlist is temporarily unavailable. Please try again." }, { status: 503 });
  }
}

export const POST = (req: Request) => updateWatchlist(req, true);
export const DELETE = (req: Request) => updateWatchlist(req, false);
