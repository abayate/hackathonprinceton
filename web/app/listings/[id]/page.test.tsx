import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createDbQuery, SYNTHETIC_CLIENT_ID, syntheticListings, syntheticProjects } from "@/test/dbFixtures";

const mocks = vi.hoisted(() => ({ query: vi.fn(), cookieGet: vi.fn(), notFound: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookieGet }) }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock("./Site3D", () => ({ default: () => null }));

import ListingPage from "./page";

const renderListing = async (id: string, mw = "100") => renderToStaticMarkup(await ListingPage({
  params: Promise.resolve({ id }), searchParams: Promise.resolve({ mw }),
}));
const decisionBox = (html: string) => html.slice(html.indexOf("<aside"), html.indexOf("</aside>") + "</aside>".length);

beforeEach(() => {
  vi.stubEnv("DATA_MODE", undefined);
  mocks.query.mockImplementation(createDbQuery());
  mocks.cookieGet.mockReturnValue({ value: SYNTHETIC_CLIENT_ID });
  mocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("database-mode listing SSR with synthetic rows", () => {
  it("leads with recorded property pricing and keeps review decisions separate from model outputs", async () => {
    const html = await renderListing(syntheticListings[0].site_id);
    const box = decisionBox(html);
    expect(box.indexOf("Recorded asking price")).toBeGreaterThan(-1);
    expect(box.indexOf("Recorded asking price")).toBeLessThan(box.indexOf("delay exposure scenario"));
    expect(box).toContain("Maximum purchase price");
    expect(box).toContain("Price ceiling");
    expect(box).toContain(">sample<");
    expect(html).toContain("Some inputs are sample placeholders");
    expect(html).toContain("Investigate this property");
    expect(html).toContain("isn&#x27;t configured");
    expect(html).toContain("Ten-year cost");
    expect(box).toContain("not a land valuation");
    expect(html).toContain('id="property-review"');
    expect(html).toContain("Your property review");
    expect(html).toContain("does not verify it");
    expect(html).toContain("Regional context, not evidence about this property");
    expect(html).not.toContain("Will it get built?");
    expect(html).not.toContain("Fly around it in 3D");
  });

  it("renders property facts, seven checks, band-based dollars, and attributed nearby project labels", async () => {
    const html = await renderListing(syntheticListings[0].site_id);
    expect(html).toContain("Synthetic Listing A");
    expect(html).toContain("100 Test Way");
    expect(html).toContain("120,000 sf");
    expect(html).toContain("Heavy power");
    expect(decisionBox(html)).toContain("Risk score 39/100");
    expect(decisionBox(html)).toContain("Low risk");
    expect(decisionBox(html)).toContain('<p class="mt-3 text-3xl font-bold text-slate-900">$12M</p>');
    expect(html).toContain("tracked Texas data center projects scored in this band were stopped");
    for (const check of ["Power", "Water", "Zoning and permits", "Community opposition",
      "Policy and incentives", "Land and building", "Labor and construction"]) expect(html).toContain(check);
    expect((html.match(/<details\b/g) ?? []).length).toBe(7);
    expect(html).toContain("Tracker label: stopped");
    expect(html).toContain("Synthetic Project Stopped");
    expect(html).toContain(`/sites/${syntheticProjects[0].project_id}`);
    expect(html).toContain("these labels have not been independently verified");
    expect(html).not.toContain("with what happened to them");
  });

  it.each([
    [syntheticListings[0].site_id, "39/100", "Low risk", "$12M"],
    [syntheticListings[1].site_id, "59/100", "Watch", "$36M"],
    [syntheticListings[2].site_id, "60/100", "High risk", "$66M"],
  ])("keeps the displayed score inside its band for %s", async (id, score, expectedBand, dollars) => {
    const box = decisionBox(await renderListing(id));
    expect(box).toContain(`<span class="text-sm font-semibold text-slate-700">Risk score ${score}</span>`);
    expect(box).toContain(`>${expectedBand}</span>`);
    expect(box).toContain(`<p class="mt-3 text-3xl font-bold text-slate-900">${dollars}</p>`);
    expect(box).toContain(`<dd class="font-bold text-slate-900">${dollars}</dd>`);
  });

  it("renders unscored California and nullable fields without a numerical delay exposure", async () => {
    const html = await renderListing(syntheticListings[3].site_id);
    expect(html).toContain("Synthetic Listing California");
    expect(html).toContain("Fictional Los Angeles, CA");
    expect(html).toContain("Not scored");
    expect(html).toContain("No cross-validation band outcome estimate for this site.");
    expect(html).toContain("Power service not recorded for this property.");
    expect(html).toContain("Zoning not recorded.");
    const box = decisionBox(html);
    expect(box).toContain('<p class="mt-3 text-3xl font-bold text-slate-900">Unknown</p>');
    expect(box).toContain('<dd class="font-bold text-slate-900">Unknown</dd>');
    expect(box).not.toMatch(/Risk score \d+\/100/);
    expect(box).not.toMatch(/<p class="mt-3 text-3xl font-bold text-slate-900">\$\d/);
  });

  it("passes a hostile ID as a parameter and takes the not-found path", async () => {
    const hostile = "costar-' OR 1=1 --";
    await expect(renderListing(hostile)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalled();
    for (const [sql, args] of mocks.query.mock.calls) {
      expect(sql).not.toContain(hostile);
      expect(args).toContain(hostile);
    }
  });

  it("parameterizes every listing and nearby lookup for a known ID", async () => {
    const id = syntheticListings[1].site_id;
    await renderListing(id);
    expect(mocks.query.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const [sql, args] of mocks.query.mock.calls) {
      expect(sql).not.toContain(id);
      if (sql.includes("FROM site_watchlist")) expect(args).toContain(SYNTHETIC_CLIENT_ID);
      else expect(args).toContain(id);
    }
  });

  it("rejects an unrecognized SQL query shape instead of returning empty rows", async () => {
    await expect(createDbQuery()("SELECT invented_secret FROM unrelated_table")).rejects.toThrow("Unexpected synthetic DB query shape");
  });

  it("rejects a listing query that stops selecting a rendered column", async () => {
    const id = syntheticListings[0].site_id;
    await renderListing(id);
    const lookup = mocks.query.mock.calls.find(([sql]) => sql.includes("FROM sites WHERE site_id = $1"));
    expect(lookup).toBeDefined();
    const [sql, args] = lookup as [string, unknown[]];
    const missingPrice = sql.replace("asking_price, ", "");
    expect(missingPrice).not.toBe(sql);
    await expect(createDbQuery()(missingPrice, args)).rejects.toThrow("Unexpected synthetic DB selected columns");
    const nearby = mocks.query.mock.calls.find(([text]) => text.includes("FROM tx_projects p, (SELECT geom FROM sites"));
    expect(nearby).toBeDefined();
    const [nearbySql, nearbyArgs] = nearby as [string, unknown[]];
    const missingTrackerLabel = nearbySql.replace("p.label, ", "");
    expect(missingTrackerLabel).not.toBe(nearbySql);
    await expect(createDbQuery()(missingTrackerLabel, nearbyArgs)).rejects.toThrow("Unexpected synthetic DB selected columns");
  });
});
