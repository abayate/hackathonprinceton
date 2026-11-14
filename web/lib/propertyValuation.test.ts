import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Listing } from "./listings";
vi.mock("server-only", () => ({}));
import { valueListing } from "./propertyValuation";

const marketText = fs.readFileSync("../data/inputs/markets.json", "utf8");
const demoText = fs.readFileSync("../data/inputs/demo_checks.json", "utf8");
// Synthetic listing fixture; no private sponsor snapshot is committed here.
const listing = (state = "TX"): Listing => ({
  site_id: state === "TX" ? "costar-238029" : "costar-755901",
  name: "Synthetic adapter fixture", address: "", city: "", state, county: null,
  lat: 0, lng: 0, property_type: "Industrial", lot_acres: 2,
  building_sf: null, ceiling_ft: null, column_width_ft: null, heavy_power: true,
  year_built: null, zoning: null, asking_price: 1_000_000, matterport_model_id: null,
  place: null, in_city_limits: true, in_urban_area: null, county_density: null,
  nearest_metro: "", km_to_metro: 0, county_tracked_projects: 0,
  water_stress_score: null, water_stress_label: state === "TX" ? "Medium - High (20-40%)" : "Extremely High (>80%)",
  p_stopped: null, model_note: null, band: null,
});
const mockFile = (text: string, checks = demoText) => vi.spyOn(fs, "readFileSync").mockImplementation(file => String(file).endsWith("demo_checks.json") ? checks : text);
afterEach(() => vi.restoreAllMocks());

describe("listing valuation with current market data", () => {
  it("maps water units and PUE/WUE without applying PUE to site water", () => {
    mockFile(marketText);
    const result = valueListing(listing(), { mw: 1.5 });
    const wet = result.cooling.evaporative;
    const energy = 1.5 * 1000 * 8760 * 0.7;
    expect(wet.annualItKwh.value).toBeCloseTo(energy);
    expect(wet.annualFacilityKwh.value).toBeCloseTo(energy * 1.2);
    expect(wet.annualWaterM3.value).toBeCloseTo(energy * 3 / 1000);
    expect(wet.annualWater.value).toBeCloseTo(energy * 3 / 1000 * 9.34 / 3.785411784);
    expect(result.cooling.dry.annualFacilityKwh.value).toBeCloseTo(energy * 1.2 * 1.25);
    expect(result.cooling.dry.annualWater.value).toBe(0);
    expect(wet.build.value).toBeCloseTo(1.5e6 * 10.51);
    expect(result.cooling.dry.build.value).toBe(wet.build.value);
    expect(wet.annualWater.source).toContain("V12");
  });
  it("keeps missing financial inputs and labor explicit", () => {
    const incomplete = JSON.parse(marketText);
    delete incomplete.markets.houston.utility_connect_usd;
    delete incomplete.global.maintenance_rate;
    delete incomplete.markets.houston.benchmark_site;
    mockFile(JSON.stringify(incomplete), '{"schema_version":1,"properties":{}}');
    const result = valueListing(listing(), { mw: 1.5 });
    expect(result.verdict).toBe("maybe");
    expect(result.missingInputs).toEqual(expect.arrayContaining(["utilityConnectUsd", "maintenanceRate", "checks.labor", "eligibleAlternative"]));
    expect(result.maxLandPricePerAcre.value).toBeNull();
    expect(result.sampleTainted).toBe(false);
  });
  it("uses Noah's public acreage and hypothetical benchmark without guaranteeing Buy", () => {
    mockFile(marketText);
    const result = valueListing(listing(), { mw: 1.5 });
    expect(result.acres).toMatchObject({ value: 1, kind: "reported", source: "V08" });
    expect(result.nextBestSiteId).toBe("benchmark-houston-greenfield-1p5mw");
    expect(result.maxLandPricePerAcre.value).toBeGreaterThan(870000);
    expect(result.maxLandPricePerAcre.value).toBeLessThan(880000);
    expect(result.verdict).toBe("pass"); // Synthetic $1M asking price exceeds the ceiling.
    expect(result.nextBestTenYearCost.kind).toBe("assumed");
    expect(result.reasons.some(reason => reason.includes("detention/site works are excluded"))).toBe(true);
    expect(result.missingInputs).toEqual([]);
  });
  it("can Buy below the benchmark ceiling while retaining the hand-checked warnings", () => {
    mockFile(marketText);
    const result = valueListing({ ...listing(), asking_price: 500000 }, { mw: 1.5 });
    expect(result.verdict).toBe("buy");
    expect(result.reasons.some(reason => reason.includes("Watch") && reason.includes("school"))).toBe(true);
    expect(result.reasons.some(reason => reason.includes("hypothetical market benchmark"))).toBe(true);
  });
  it("preserves the LA water failure and selects California prices", () => {
    mockFile(marketText);
    const result = valueListing(listing("CA"), { mw: 1.5 });
    expect(result.verdict).toBe("pass");
    expect(result.reasons.some(reason => reason.includes("water:") && reason.includes("Extremely High"))).toBe(true);
    expect(result.cooling.evaporative.build.value).toBeCloseTo(1.5e6 * 15.01);
    expect(result.cooling.evaporative.annualPower.value).toBeCloseTo(1.5 * 1000 * 8760 * 0.7 * 1.2 * 0.2412);
  });
  it("keeps an absent asking price unknown", () => {
    mockFile(marketText);
    const result = valueListing({ ...listing(), asking_price: null }, { mw: 1.5 });
    expect(result.verdict).toBe("maybe");
    expect(result.askingPricePerAcre.value).toBeNull();
  });
  it("never uses Texas pricing for an unsupported state", () => {
    mockFile(marketText);
    const result = valueListing(listing("NY"), { mw: 1.5 });
    expect(result.cooling.evaporative.build.value).toBeNull();
    expect(result.missingInputs).toContain("market");
  });
  it.each([0, -1, NaN, Infinity])("keeps invalid requested MW %s unknown", mw => {
    mockFile(marketText);
    const result = valueListing(listing(), { mw });
    expect(result.verdict).toBe("maybe");
    expect(result.mw.value).toBeNull();
  });
  it("does not mutate the listing", () => {
    mockFile(marketText);
    const input = Object.freeze(listing());
    expect(() => valueListing(input, { mw: 1.5 })).not.toThrow();
    expect(input).toEqual(listing());
  });
  it("does not discard a sourced failure among conflicting duplicate overlays", () => {
    const demo = JSON.parse(demoText);
    demo.properties["costar-238029"].checks.push({ id: "labor", status: "fail", detail: "Synthetic labor stoppage", source: "test" });
    mockFile(marketText, JSON.stringify(demo));
    const result = valueListing({ ...listing(), asking_price: 500000 }, { mw: 1.5 });
    expect(result.verdict).toBe("pass");
    expect(result.reasons.join(" ")).toContain("Synthetic labor stoppage");
  });
  it("does not disclose a filesystem error path", () => {
    vi.spyOn(fs, "readFileSync").mockImplementation(() => { throw Object.assign(new Error("secret filesystem path"), { code: "EACCES" }); });
    expect(() => valueListing(listing(), { mw: 1.5 })).toThrow("Unable to read valuation inputs.");
  });
  it("reports missing market data", () => {
    vi.spyOn(fs, "readFileSync").mockImplementation(() => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); });
    const result = valueListing(listing(), { mw: 1.5 });
    expect(result.verdict).toBe("maybe");
    expect(result.missingInputs).toContain("data/inputs/markets.json");
  });
  it.each(["{", "null", "[]", '{"schema_version":99}'])("fails closed for malformed input %s", text => {
    mockFile(text);
    expect(valueListing(listing(), { mw: 1.5 }).missingInputs).toContain("data/inputs/markets.json");
  });
});
