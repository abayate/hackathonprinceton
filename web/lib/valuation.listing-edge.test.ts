import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Listing } from "./listings";

vi.mock("server-only", () => ({}));

// Imported after the server-only mock is registered.
import { valueListing } from "./propertyValuation";

// ---- real inputs, loaded BEFORE readFileSync is spied ----
const ROOT = path.resolve(process.cwd(), "..");
const MARKETS_TEXT = fs.readFileSync(path.join(ROOT, "data/inputs/markets.json"), "utf8");
const DEMO_TEXT = fs.readFileSync(path.join(ROOT, "data/inputs/demo_checks.json"), "utf8");
const realRead = fs.readFileSync.bind(fs);

const enoent = () => Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });

/** Serve controlled file contents to the adapter; anything else reads the real filesystem. */
function serveFiles(served: { markets?: string | Error; demo?: string | Error } = {}) {
  vi.spyOn(fs, "readFileSync").mockImplementation(((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
    const name = String(file);
    const pick = (content: string | Error) => {
      if (content instanceof Error) throw content;
      return content;
    };
    if (name.includes("markets.json")) return pick(served.markets ?? MARKETS_TEXT);
    if (name.includes("demo_checks")) return pick(served.demo ?? DEMO_TEXT);
    return (realRead as (...a: unknown[]) => unknown)(file, ...rest);
  }) as typeof fs.readFileSync);
}

afterEach(() => vi.restoreAllMocks());

type DemoCheck = { id: string; status: string; detail: string; source?: string };
function demoWithHoustonChecks(mutate: (checks: DemoCheck[]) => DemoCheck[]): string {
  const parsed = JSON.parse(DEMO_TEXT);
  const entry = parsed.properties["costar-238029"];
  entry.checks = mutate(entry.checks as DemoCheck[]);
  return JSON.stringify(parsed);
}

// SYNTHETIC fixtures. Every value below is made up for tests and resembles no
// CoStar/Vexcel/Matterport record; only site_id is reused so the demo_checks
// overlay (public, hand-checked statuses) can match. Never add sponsor data here.
const makeListing = (over: Partial<Listing>): Listing => ({
  site_id: "synthetic-site", name: "Synthetic test parcel", address: "0 Test Rd", city: "Testville",
  state: "TX", county: "Test County", lat: 0, lng: 0, property_type: "Land", lot_acres: 1.27,
  building_sf: null, ceiling_ft: null, column_width_ft: null, heavy_power: true, year_built: null,
  zoning: null, asking_price: 500_000, matterport_model_id: null, place: "Testville",
  in_city_limits: false, in_urban_area: false, county_density: 100, nearest_metro: "Test Metro",
  km_to_metro: 10, county_tracked_projects: 0, water_stress_score: 0.3,
  water_stress_label: "Medium - High (20-40%)", p_stopped: 0.26, model_note: null, band: "green",
  ...over,
});
const houstonDemo = () => makeListing({ site_id: "costar-238029" });
const laDemo = () => makeListing({
  site_id: "costar-755901", state: "CA", lot_acres: 3.2, asking_price: 4_000_000,
  water_stress_label: "Extremely High (>80%)", zoning: "M3", in_city_limits: true, place: "Los Angeles",
});

describe("overlay matching by site id", () => {
  it("applies the hand-checked overlay and reaches Buy on the Houston demo at 1.5 MW", () => {
    serveFiles();
    const v = valueListing(houstonDemo(), { mw: 1.5 });
    expect(v.verdict).toBe("buy");
    expect(v.nextBestSiteId).toBe("benchmark-houston-greenfield-1p5mw");
    expect(v.recommendedCooling).toBe("evaporative");
    expect(v.missingInputs).toEqual([]);
    // Benchmark land is $876K for 1 subject acre; identical non-land costs cancel.
    // Tolerance ±500 absorbs the file's pre-rounded benchmark water rate, while a
    // $750K detention remap into the ceiling would fail this assertion.
    expect(v.maxLandPricePerAcre.value).toBeCloseTo(876_000, -3);
    // The all-pass benchmark is hypothetical and must say so prominently.
    expect(v.reasons.join(" ")).toMatch(/benchmark|next-best/i);
    expect(v.reasons.join(" ")).toMatch(/hypothetical|assumed|not a real listing/i);
  });

  it("does not apply any overlay to an unmatched site id: labor stays unknown, never Buy", () => {
    serveFiles();
    const v = valueListing(makeListing({ site_id: "synthetic-unmatched" }), { mw: 1.5 });
    expect(v.verdict).toBe("maybe");
    expect(v.missingInputs.join(" ")).toMatch(/labor/);
  });

  it("LA demo stays Pass on its water fail while the benchmark is still usable as the ceiling", () => {
    serveFiles();
    const v = valueListing(laDemo(), { mw: 1.5 });
    expect(v.verdict).toBe("pass");
    // markets.json lists the LA benchmark's own water check as "fail"; the agreed
    // behavior is an all-pass hypothetical benchmark, so it must not be excluded.
    expect(v.nextBestSiteId).toBe("benchmark-los-angeles-greenfield-1p5mw");
    expect(v.maxLandPricePerAcre.value).not.toBeNull();
    expect(v.maxLandPricePerAcre.value!).toBeGreaterThan(0);
  });
});

describe("labor overlay variants", () => {
  it("a missing labor entry in the overlay keeps labor unknown: Maybe, not Buy", () => {
    serveFiles({ demo: demoWithHoustonChecks(checks => checks.filter(check => check.id !== "labor")) });
    const v = valueListing(houstonDemo(), { mw: 1.5 });
    expect(v.verdict).toBe("maybe");
    expect(v.missingInputs.join(" ")).toMatch(/labor/);
  });

  it("an invalid overlay status never becomes pass: Maybe, not Buy", () => {
    serveFiles({ demo: demoWithHoustonChecks(checks => checks.map(check =>
      check.id === "labor" ? { ...check, status: "verified" } : check)) });
    const v = valueListing(houstonDemo(), { mw: 1.5 });
    expect(v.verdict).toBe("maybe");
  });

  it("duplicate conflicting labor entries never permit Buy", () => {
    serveFiles({ demo: demoWithHoustonChecks(checks =>
      [...checks, { id: "labor", status: "watch", detail: "Synthetic duplicate for the conflict test." }]) });
    expect(valueListing(houstonDemo(), { mw: 1.5 }).verdict).toBe("maybe");
  });
});

describe("public-record acreage", () => {
  it("prefers the public-record acreage over the listing's lot size for land math", () => {
    serveFiles();
    const v = valueListing(houstonDemo(), { mw: 1.5 }); // listing says 1.27 ac, HCAD says 1.00
    expect(v.acres.value).toBe(1);
    expect(v.askingPricePerAcre.value).toBeCloseTo(500_000, 0);
    const la = valueListing(laDemo(), { mw: 1.5 }); // listing says 3.2 ac, Assessor says 3.17
    expect(la.acres.value).toBe(3.17);
  });

  it("keeps the listing acreage when no overlay entry supplies a public record", () => {
    serveFiles();
    expect(valueListing(makeListing({ site_id: "synthetic-unmatched" }), { mw: 1.5 }).acres.value).toBe(1.27);
  });
});

describe("benchmark workload is fixed at 1.5 MW", () => {
  it("does not silently resize the benchmark for a different requested workload", () => {
    serveFiles();
    const v = valueListing(houstonDemo(), { mw: 3 });
    expect(v.nextBestSiteId).toBeNull();
    expect(v.maxLandPricePerAcre.value).toBeNull();
    expect(v.verdict).toBe("maybe");
    expect(v.mw.value).toBe(3);
  });
});

describe("missing files and unsupported schemas fail closed", () => {
  it.each([
    ["markets.json absent", { markets: enoent() }],
    ["markets.json unsupported schema", { markets: JSON.stringify({ schema_version: 2, markets: {} }) }],
    ["markets.json malformed", { markets: "{not json" }],
  ])("%s: Maybe, named missing input, no throw", (_name, served) => {
    serveFiles(served);
    const v = valueListing(houstonDemo(), { mw: 1.5 });
    expect(v.verdict).toBe("maybe");
    expect(v.missingInputs.join(" ")).toMatch(/markets\.json|market/);
    // No invented market values: Texas constants must not leak in as a default.
    expect(v.cooling.evaporative.powerPv.value).toBeNull();
  });

  it.each([
    ["demo_checks.json absent", { demo: enoent() }],
    ["demo_checks.json unsupported schema", { demo: JSON.stringify({ schema_version: 99, properties: {} }) }],
  ])("%s: no overlay, labor unknown, never Buy", (_name, served) => {
    serveFiles(served);
    const v = valueListing(houstonDemo(), { mw: 1.5 });
    expect(v.verdict).toBe("maybe");
    expect(v.missingInputs.join(" ")).toMatch(/labor/);
  });

  it("a listing outside the supported markets is Maybe with a named reason", () => {
    serveFiles();
    const v = valueListing(makeListing({ site_id: "synthetic-nj", state: "NJ" }), { mw: 1.5 });
    expect(v.verdict).toBe("maybe");
    expect(v.reasons.join(" ")).toMatch(/market/i);
  });
});

describe("purity", () => {
  it("never mutates the listing or options and is deterministic", () => {
    serveFiles();
    const listing = Object.freeze(houstonDemo());
    const opts = Object.freeze({ mw: 1.5 });
    const before = JSON.stringify(listing);
    const first = valueListing(listing, opts);
    const second = valueListing(listing, opts);
    expect(JSON.stringify(listing)).toBe(before);
    expect(JSON.parse(JSON.stringify(second))).toEqual(JSON.parse(JSON.stringify(first)));
  });
});
