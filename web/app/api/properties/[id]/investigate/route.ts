import { after } from "next/server";
import { clientSession, isPropertyId, isSameOrigin, reply } from "@/lib/apiSession";
import { isPublicDataMode } from "@/lib/dataMode";
import { isPropertyInvestigatorEnabled } from "@/lib/featureFlags";
import { createGeminiMemoWriter, isGeminiConfigured } from "@/lib/geminiClient";
import { getStore } from "@/lib/gwStore";
import type { Listing } from "@/lib/listings";
import { newRun, runPropertyInvestigation, valuationForMemo, type PropertyFacts } from "@/lib/propertyInvestigator";
import { readJsonBody } from "@/lib/requestBody";
import type { PropertyValuation } from "@/lib/valuationTypes";

export const runtime = "nodejs";
// The run keeps working after the 202 via after(); Vercel needs the function to live that long.
export const maxDuration = 60;

/** The demo workload, in MW of IT power. */
const DEFAULT_MW = 1.5;
const MAX_MW = 5000;
const BODY_LIMIT = 1_024;
const RUNS_PER_CLIENT_PER_HOUR = 5;
const recent = new Map<string, number[]>();

/** Per-process limit. Not durable across instances; good enough for a demo, not for a public launch. */
function allowRun(clientId: string, now = Date.now()): boolean {
  const hourAgo = now - 3_600_000;
  const times = (recent.get(clientId) ?? []).filter((t) => t > hourAgo);
  if (times.length >= RUNS_PER_CLIENT_PER_HOUR) { recent.set(clientId, times); return false; }
  recent.set(clientId, [...times, now]);
  return true;
}

/** The body is optional. If present it is `{}` or `{ "mw": <number> }`; anything else is rejected (null). */
async function workloadMw(req: Request): Promise<number | null> {
  if (!req.headers.get("content-type") && !Number(req.headers.get("content-length"))) return DEFAULT_MW;
  const body = await readJsonBody(req, BODY_LIMIT);
  if (!body.ok || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) return null;
  const value = body.value as Record<string, unknown>;
  if (Object.keys(value).some((key) => key !== "mw")) return null;
  if (value.mw === undefined) return DEFAULT_MW;
  return typeof value.mw === "number" && Number.isFinite(value.mw) && value.mw > 0 && value.mw <= MAX_MW ? value.mw : null;
}

/** Marvin's engine on this listing and workload. valuationForMemo() still caps a sample-tainted Buy at Maybe. */
async function valueListingForMemo(listing: Listing, mw: number): Promise<PropertyValuation> {
  const { valueListing } = await import("@/lib/propertyValuation");
  return valueListing(listing, { mw });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isPropertyInvestigatorEnabled()) return reply(req, 404, { detail: "Not found" });
  if (isPublicDataMode()) return reply(req, 501, { detail: "Property memos need the listings database." });
  if (!isGeminiConfigured()) return reply(req, 503, { detail: "The investigator is unavailable." });
  if (!isSameOrigin(req)) return reply(req, 422, { detail: "Start investigations from this site." });
  const { id } = await params;
  if (!isPropertyId(id)) return reply(req, 404, { detail: "Unknown property." });
  const mw = await workloadMw(req);
  if (mw === null) return reply(req, 422, { detail: `Send {"mw": <positive number up to ${MAX_MW}>} or no body.` });
  const session = await clientSession();

  try {
    const store = await getStore();
    const running = await store.runningRunFor(id);
    if (running) return reply(req, 200, { run_id: running }, session);

    const { getListing } = await import("@/lib/listings");
    const listing = await getListing(id);
    if (!listing) return reply(req, 404, { detail: "Unknown property." }, session);
    if (!allowRun(session.id)) return reply(req, 429, { detail: "Investigation limit reached. Try again later." }, session);

    const facts: PropertyFacts = {
      property_id: listing.site_id, name: listing.name, address: listing.address, city: listing.city,
      state: listing.state, county: listing.county, property_type: listing.property_type, lot_acres: listing.lot_acres,
      building_sf: listing.building_sf, zoning: listing.zoning, heavy_power: listing.heavy_power,
      year_built: listing.year_built, asking_price: listing.asking_price,
    };
    const valuation = valuationForMemo(await valueListingForMemo(listing, mw));
    const writer = createGeminiMemoWriter();
    const run = newRun(id);
    await store.saveRun(run);
    after(() => runPropertyInvestigation(run, facts, valuation, writer, store));
    return reply(req, 202, { run_id: run.run_id }, session);
  } catch {
    // No connection strings, keys or sponsor fields in logs.
    console.error("Property investigation could not start");
    return reply(req, 503, { detail: "The investigator is unavailable. Try again later." }, session);
  }
}
