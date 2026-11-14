import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isEvidenceIntakeEnabled } from "@/lib/featureFlags";
import { isPublicDataMode } from "@/lib/dataMode";
import { isClientId } from "@/lib/params";
import { getPublicSite } from "@/lib/publicStore";
import { parseIntakeInput, verifyAndStoreIntake, type IntakeInput } from "@/lib/intakePipeline";

export const runtime = "nodejs";
const BODY_LIMIT = 16_384;
async function readBody(req: Request): Promise<unknown> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json") || Number(req.headers.get("content-length")) > BODY_LIMIT) throw new Error("Invalid JSON request");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > BODY_LIMIT) { await reader.cancel(); throw new Error("Request too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function POST(req: Request) {
  if (!isEvidenceIntakeEnabled()) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  if (!isPublicDataMode()) return NextResponse.json({ detail: "Evidence intake is available in public data mode only." }, { status: 501 });
  const existing = (await cookies()).get("client_id")?.value;
  const clientId = isClientId(existing) ? existing : crypto.randomUUID();
  const reply = (code: number, body: object) => {
    const res = NextResponse.json(body, { status: code });
    res.headers.set("Cache-Control", "no-store");
    if (clientId !== existing) res.cookies.set("client_id", clientId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: new URL(req.url).protocol === "https:" });
    return res;
  };
  let input: IntakeInput;
  try {
    const origin = req.headers.get("origin");
    if (origin) {
      const originUrl = new URL(origin);
      // Next may construct req.url with an internal hostname; Host is the browser's target.
      const host = req.headers.get("host") ?? new URL(req.url).host;
      if (!["http:", "https:"].includes(originUrl.protocol) || originUrl.host !== host) return reply(422, { detail: "Submit evidence from this site." });
    }
    input = parseIntakeInput(await readBody(req));
  } catch (error) {
    return reply(422, { detail: error instanceof SyntaxError ? "A valid JSON body is required." : error instanceof Error ? error.message : "Invalid evidence submission." });
  }
  try {
    if (!await getPublicSite(input.project_id)) return reply(422, { detail: "Unknown public project." });
    const result = await verifyAndStoreIntake(input, clientId);
    if (result.decision === "accepted") return reply(201, { signal: result.signal, source_status: result.source_status });
    const status = result.decision === "duplicate" ? 409
      : result.decision === "rate_limited" || result.decision === "store_full" ? 429
      : result.decision === "fetch_failed" ? 502 : 422;
    return reply(status, { detail: result.reason });
  } catch {
    return reply(502, { detail: "The source page could not be verified. Try another public text page." });
  }
}
