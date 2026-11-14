import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

const COOKIE = "client_id";

async function clientId(): Promise<{ id: string; isNew: boolean }> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  return existing ? { id: existing, isNew: false } : { id: crypto.randomUUID(), isNew: true };
}

function withCookie(res: NextResponse, id: string, isNew: boolean) {
  if (isNew) res.cookies.set(COOKIE, id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
}

export async function POST(req: Request) {
  const { project_id } = await req.json();
  if (typeof project_id !== "string") return NextResponse.json({ detail: "project_id required" }, { status: 422 });
  const { id, isNew } = await clientId();
  await pool.query(
    "INSERT INTO site_watchlist (client_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [id, project_id],
  );
  return withCookie(NextResponse.json({ saved: true }), id, isNew);
}

export async function DELETE(req: Request) {
  const { project_id } = await req.json();
  const { id, isNew } = await clientId();
  await pool.query("DELETE FROM site_watchlist WHERE client_id = $1 AND project_id = $2", [id, project_id]);
  return withCookie(NextResponse.json({ saved: false }), id, isNew);
}
