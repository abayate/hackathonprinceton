import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isInvestigatorEnabled } from "@/lib/featureFlags";
import { isPublicDataMode } from "@/lib/dataMode";
import { isClientId } from "@/lib/params";
import { getPublicSite } from "@/lib/publicStore";
import { createGeminiClient, isGeminiConfigured } from "@/lib/geminiClient";
import { buildInvestigationPlan, runInvestigation } from "@/lib/investigator";
import { verifyAndStoreIntake } from "@/lib/intakePipeline";
import { reserveInvestigationRun } from "@/lib/intakeStore";

export const runtime = "nodejs";
const BODY_LIMIT = 4_096;

async function projectFromRequest(req: Request): Promise<string> {
  const origin = req.headers.get("origin");
  if (origin) {
    const url = new URL(origin);
    const host = req.headers.get("host") ?? new URL(req.url).host;
    if (!["http:", "https:"].includes(url.protocol) || url.host !== host) throw new Error("Invalid origin");
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json") || Number(req.headers.get("content-length")) > BODY_LIMIT) throw new Error("Invalid JSON request");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > BODY_LIMIT) { await reader.cancel(); throw new Error("Request too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1
    || !("project_id" in body) || !isClientId(body.project_id)) throw new Error("Invalid project");
  return body.project_id;
}

export async function POST(req: Request) {
  const response = (status: number, body: object) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!isInvestigatorEnabled()) return response(404, { detail: "Not found" });
  if (!isPublicDataMode()) return response(501, { detail: "Investigation is available in public data mode only." });
  if (!isGeminiConfigured()) return response(503, { detail: "Investigator is not configured" });
  const existing = (await cookies()).get("client_id")?.value;
  const clientId = isClientId(existing) ? existing : crypto.randomUUID();
  const reply = (status: number, body: object) => {
    const res = response(status, body);
    if (clientId !== existing) res.cookies.set("client_id", clientId, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: new URL(req.url).protocol === "https:",
    });
    return res;
  };
  let projectId: string;
  try { projectId = await projectFromRequest(req); }
  catch { return reply(422, { detail: "Choose a tracked public project and submit the request from this site." }); }
  try {
    const site = await getPublicSite(projectId);
    if (!site) return reply(422, { detail: "Unknown public project." });
    const investigation = reserveInvestigationRun(clientId);
    if (!investigation) return reply(429, { detail: "Investigation limit reached. Try again later." });
    const report = await runInvestigation(buildInvestigationPlan(site), createGeminiClient(), (input, deadlineAt) =>
      verifyAndStoreIntake(input, clientId, { proposedBy: "investigator", investigation, deadlineAt }));
    const globallyLimited = report.candidates.some((candidate) => candidate.decision === "rate_limited" && candidate.limit_scope === "global");
    return reply(globallyLimited ? 429 : 200, report);
  } catch {
    return reply(502, { detail: "The investigation could not be completed. Try again later." });
  }
}
