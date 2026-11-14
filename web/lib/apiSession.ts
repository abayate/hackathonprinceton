import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isClientId } from "./params";

const COOKIE = "client_id";

/** Groundwork property IDs come from build_sites.py: "costar-" + the CoStar property ID. */
export function isPropertyId(value: unknown): value is string {
  return typeof value === "string" && /^costar-[A-Za-z0-9_-]{1,80}$/.test(value);
}

/** Rejects cross-site writes. A missing Origin (curl, same-origin GET) is allowed. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return true;
  try {
    const url = new URL(origin);
    const host = req.headers.get("host") ?? new URL(req.url).host;
    return ["http:", "https:"].includes(url.protocol) && url.host === host;
  } catch { return false; }
}

export type ClientSession = { id: string; isNew: boolean };

export async function clientSession(): Promise<ClientSession> {
  const existing = (await cookies()).get(COOKIE)?.value;
  return isClientId(existing) ? { id: existing, isNew: false } : { id: crypto.randomUUID(), isNew: true };
}

/** JSON reply that is never cached and sets the anonymous client cookie the first time. */
export function reply(req: Request, status: number, body: object, session?: ClientSession): NextResponse {
  const res = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (session?.isNew) {
    res.cookies.set(COOKIE, session.id, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: new URL(req.url).protocol === "https:",
    });
  }
  return res;
}
