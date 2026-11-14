import { NextResponse } from "next/server";
import { isClientId } from "@/lib/params";
import { getPublicSite } from "@/lib/publicStore";
import { getSignals } from "@/lib/signalStore";
import { readJsonBody } from "@/lib/requestBody";
import { fetchPublicText, SafeFetchError } from "@/lib/safeFetch";
import { watchedSourcesFor, toParagraphs } from "@/lib/sourceMonitor";
import { MONITOR_MAX_SOURCES, type SourceCheck, type SourceCheckResponse } from "@/lib/sourceMonitorTypes";

export const runtime = "nodejs";

const BODY_LIMIT = 1_024;
const MAX_ACTIVE_RUNS = 3; // Each run fetches serially, so this also bounds outbound concurrency.
const MAX_FETCHES_PER_MINUTE = 60;
const WINDOW_MS = 60_000;
const PROJECT_COOLDOWN_MS = 1_000;

let activeRuns = 0;
let windowStart = 0;
let windowCount = 0;
const lastProjectStart = new Map<string, number>();

function reply(status: number, body: object, retryAfter?: number) {
  const response = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (retryAfter !== undefined) response.headers.set("Retry-After", String(retryAfter));
  return response;
}

function sameOrigin(req: Request): boolean {
  const raw = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");
  if (!raw || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) return false;
  try {
    const origin = new URL(raw);
    const requestUrl = new URL(req.url);
    const host = req.headers.get("host") ?? requestUrl.host;
    return origin.protocol === requestUrl.protocol && origin.host === host
      && !origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash;
  } catch { return false; }
}

function projectIdFrom(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  return Object.keys(input).length === 1 && Object.hasOwn(input, "projectId") && isClientId(input.projectId)
    ? input.projectId : null;
}

function reserve(projectId: string, sources: number, now = Date.now()): number | null {
  if (activeRuns >= MAX_ACTIVE_RUNS) return 1;
  if (now - windowStart >= WINDOW_MS) { windowStart = now; windowCount = 0; }
  if (windowCount + sources > MAX_FETCHES_PER_MINUTE) return Math.max(1, Math.ceil((WINDOW_MS - (now - windowStart)) / 1_000));
  const previous = lastProjectStart.get(projectId);
  if (previous !== undefined && now - previous < PROJECT_COOLDOWN_MS) {
    return Math.max(1, Math.ceil((PROJECT_COOLDOWN_MS - (now - previous)) / 1_000));
  }
  for (const [id, started] of lastProjectStart) if (now - started >= PROJECT_COOLDOWN_MS) lastProjectStart.delete(id);
  lastProjectStart.set(projectId, now);
  windowCount += sources;
  activeRuns += 1;
  return null;
}

function notText(error: unknown): boolean {
  return error instanceof SafeFetchError && error.code === "fetch_failed"
    && error.message === "Source page must be text or HTML";
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply(422, { detail: "Check sources from this site." });
  const body = await readJsonBody(req, BODY_LIMIT);
  const projectId = body.ok ? projectIdFrom(body.value) : null;
  if (!projectId) return reply(422, { detail: "Choose a tracked public project." });

  try {
    const site = await getPublicSite(projectId);
    if (!site) return reply(422, { detail: "Unknown public project." });
    const sources = watchedSourcesFor(site, await getSignals()).slice(0, MONITOR_MAX_SOURCES);
    if (!sources.length) return reply(200, { projectId, checks: [] } satisfies SourceCheckResponse);
    const retryAfter = reserve(projectId, sources.length);
    if (retryAfter !== null) return reply(429, { detail: "Source checks are busy. Try again shortly." }, retryAfter);
    try {
      const checks: SourceCheck[] = [];
      for (const source of sources) {
        try {
          const page = await fetchPublicText(source.url);
          const paragraphs = toParagraphs(page.text, page.contentType);
          checks.push({ sourceId: source.id, fetchedAt: new Date().toISOString(),
            outcome: paragraphs.length ? "ok" : "not_text", paragraphs });
        } catch (error) {
          checks.push({ sourceId: source.id, fetchedAt: new Date().toISOString(),
            outcome: notText(error) ? "not_text" : "unreachable", paragraphs: [] });
        }
      }
      return reply(200, { projectId, checks } satisfies SourceCheckResponse);
    } finally { activeRuns -= 1; }
  } catch {
    return reply(502, { detail: "Source check could not be completed. Try again later." });
  }
}
