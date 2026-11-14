import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Listing } from "./listings";
vi.mock("server-only", () => ({}));
import { valueListing } from "./propertyValuation";

const markets = JSON.parse(fs.readFileSync("../data/inputs/markets.json", "utf8"));
const checks = fs.readFileSync("../data/inputs/demo_checks.json", "utf8");
// Synthetic geometry and price; only ID matches the public check override.
const listing = { site_id: "costar-238029", state: "TX", property_type: "Industrial",
  lot_acres: 1, building_sf: 30000, ceiling_ft: 20, asking_price: 1000000,
  heavy_power: true, in_city_limits: true, p_stopped: null,
  water_stress_label: "Medium - High (20-40%)", km_to_metro: 0,
} as Listing;
const tagged = (value: number, unit: string) => ({ value, unit, kind: "assumed", source: "assumption:synthetic-reuse-rule" });
const rule = {
  build_multiplier: tagged(0.85, "ratio"),
  applicability: { min_sf_per_mw: tagged(10000, "SF/MW"), min_clear_height_ft: tagged(18, "ft") },
};
function serve(reuse: unknown = rule, delta = 0, omitReuse = false) {
  const { existing_building: _existing, ...withoutReuse } = markets;
  void _existing;
  const data = { ...withoutReuse, ...(omitReuse ? {} : { existing_building: reuse }), cooling: { ...markets.cooling,
    capex_delta_usd_per_w: tagged(delta, "USD/W") } };
  vi.spyOn(fs, "readFileSync").mockImplementation(file => String(file).endsWith("demo_checks.json") ? checks : JSON.stringify(data));
}
afterEach(() => vi.restoreAllMocks());

describe("existing-building reuse", () => {
  it("labels the provisional assumption when Noah's block is absent", () => {
    serve(rule, 0, true);
    const result = valueListing(listing, { mw: 1.5 });
    expect(result.cooling.evaporative.build.value).toBeCloseTo(1.5e6 * 10.51 * 0.85);
    expect(result.cooling.evaporative.build.source).toContain("assumption:round3-building-reuse");
    expect(result.reasons.join(" ")).toContain("provisional assumed rule");
  });
  it("retains the configured multiplier source and original kind in the explanation", () => {
    serve({ ...rule, build_multiplier: { value: 0.9, unit: "ratio", kind: "reported", source: "synthetic-source" } });
    const result = valueListing(listing, { mw: 1.5 });
    expect(result.cooling.evaporative.build.source).toContain("synthetic-source");
    expect(result.reasons.join(" ")).toContain("0.9, reported, source synthetic-source");
    // Other consumed assumptions still prevent the final estimate being labeled reported.
    expect(result.cooling.evaporative.build.kind).not.toBe("reported");
  });
  it("discounts qualifying construction and maintenance, preserving energy and greenfield costs", () => {
    serve();
    const reuse = valueListing(listing, { mw: 1.5 });
    const baseline = valueListing({ ...listing, building_sf: 0 }, { mw: 1.5 });
    expect(reuse.cooling.evaporative.build.value).toBeCloseTo(baseline.cooling.evaporative.build.value! * 0.85);
    expect(reuse.cooling.evaporative.annualMaintenance.value).toBeCloseTo(baseline.cooling.evaporative.annualMaintenance.value! * 0.85);
    expect(reuse.cooling.evaporative.annualPower).toEqual(baseline.cooling.evaporative.annualPower);
    expect(reuse.cooling.evaporative.annualWater).toEqual(baseline.cooling.evaporative.annualWater);
    expect(reuse.nextBestTenYearCost).toEqual(baseline.nextBestTenYearCost);
    expect(reuse.sensitivities.electricity[1].totalPv.value).toBe(reuse.tenYearCost.value);
    expect(reuse.sensitivities.electricity[1].maxLandPricePerAcre.value).toBe(reuse.maxLandPricePerAcre.value);
    expect(reuse.cooling.evaporative.build.source).toContain("assumption:synthetic-reuse-rule");
    expect(reuse.cooling.evaporative.build.kind).toBe("assumed");
    expect(reuse.reasons.join(" ")).toMatch(/Reuses.*30,000 SF.*0\.85/);
    expect(reuse.reasons.join(" ")).toContain("assumption:synthetic-reuse-rule");
  });
  it("does not also discount the incremental cooling capital cost", () => {
    serve(rule, 2);
    const result = valueListing(listing, { mw: 1.5 });
    expect(result.cooling.dry.build.value! - result.cooling.evaporative.build.value!).toBeCloseTo(1.5e6 * 2);
  });
  it.each([
    { building_sf: 14999 }, { ceiling_ft: 17.99 }, { building_sf: 0 },
    { building_sf: null }, { ceiling_ft: null }, { building_sf: NaN }, { ceiling_ft: Infinity },
  ])("does not assume eligibility when geometry is insufficient or unknown: %j", overrides => {
    serve();
    const result = valueListing({ ...listing, ...overrides }, { mw: 1.5 });
    expect(result.cooling.evaporative.build.value).toBeCloseTo(1.5e6 * 10.51);
    expect(result.reasons.join(" ")).not.toMatch(/Reuses/);
  });
  it("includes exact thresholds and scales area with MW", () => {
    serve();
    expect(valueListing({ ...listing, building_sf: 15000, ceiling_ft: 18 }, { mw: 1.5 }).cooling.evaporative.build.value).toBeCloseTo(1.5e6 * 10.51 * 0.85);
    expect(valueListing({ ...listing, building_sf: 15000, ceiling_ft: 18 }, { mw: 2 }).cooling.evaporative.build.value).toBeCloseTo(2e6 * 10.51);
  });
  it("uses the supplied multiplier rather than pinning the discount to 0.85", () => {
    serve({ ...rule, build_multiplier: tagged(0.9, "ratio") });
    expect(valueListing(listing, { mw: 1.5 }).cooling.evaporative.build.value).toBeCloseTo(1.5e6 * 10.51 * 0.9);
  });
  it.each([0, -1, 1.1, "0.85", null])("does not substitute the fallback for malformed supplied multiplier %s", value => {
    serve({ ...rule, build_multiplier: { ...rule.build_multiplier, value } });
    const result = valueListing(listing, { mw: 1.5 });
    expect(result.cooling.evaporative.build.value).toBeCloseTo(1.5e6 * 10.51);
    expect(result.reasons.join(" ")).not.toMatch(/Reuses/);
  });
  it.each([{}, { min_sf_per_mw: tagged(0, "SF/MW"), min_clear_height_ft: tagged(18, "ft") },
    { min_sf_per_mw: tagged(10000, "SF/MW"), min_clear_height_ft: tagged(-1, "ft") }])("rejects incomplete or invalid applicability %j", applicability => {
    serve({ ...rule, applicability });
    expect(valueListing(listing, { mw: 1.5 }).cooling.evaporative.build.value).toBeCloseTo(1.5e6 * 10.51);
  });
  it("propagates a sample multiplier instead of turning synthetic savings into real guidance", () => {
    serve({ ...rule, build_multiplier: { ...rule.build_multiplier, kind: "sample" } });
    const result = valueListing(listing, { mw: 1.5 });
    expect(result.cooling.evaporative.build.kind).toBe("sample");
    expect(result.sampleTainted).toBe(true);
    expect(result.nextBestSiteId).toBeNull();
  });
  it("leaves the LA water failure in force even with reuse savings", () => {
    serve();
    const result = valueListing({ ...listing, site_id: "costar-755901", state: "CA", water_stress_label: "Extremely High (>80%)" }, { mw: 1.5 });
    expect(result.verdict).toBe("pass");
    expect(result.reasons.some(reason => reason.startsWith("water:"))).toBe(true);
  });
});
