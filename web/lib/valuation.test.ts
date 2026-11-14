import { describe, expect, it } from "vitest";
import { breakEvenLandPricePerAcre, calculateTenYearCosts, type TenYearCostInputs } from "./model";
import type {
  Alternative, Tagged, ValuationCheck, ValuationCheckId, ValuationInputs,
} from "./valuationTypes";
import { sampleValuation, tenYearPv, valueProperty } from "./valuation";

// ---------- fixtures ----------

const tag = (value: number | null, unit: string, kind: Tagged["kind"] = "reported"): Tagged =>
  ({ value, unit, kind, source: "test-fixture" });

const coolingInputs = (pue: number, wue: number, mult: number, eligible: boolean | null = true) =>
  ({ eligible, pue: tag(pue, "kWh/kWh"), wueLPerItKwh: tag(wue, "L/kWh"), buildMultiplier: tag(mult, "ratio") });

/** 1 MW / 1 acre subject so per-acre numbers equal totals and equality is exact. */
const inputs = (siteId: string, over: Partial<ValuationInputs> = {}): ValuationInputs => ({
  siteId,
  mw: tag(1, "MW"),
  acres: tag(1, "acre"),
  askingPriceTotal: tag(1_000_000, "USD"),
  buildCostUsdPerW: tag(10, "USD/W"),
  utilityConnectUsd: tag(500_000, "USD"),
  electricityUsdPerKwh: tag(0.1, "USD/kWh"),
  waterUsdPerM3: tag(1, "USD/m3"),
  maintenanceRate: tag(0.01, "ratio"),
  avgLoad: tag(1, "ratio"),
  cooling: { evaporative: coolingInputs(1.2, 2, 1), dry: coolingInputs(1.4, 0, 1.1) },
  ...over,
});

const CHECK_IDS: readonly ValuationCheckId[] = ["power", "water", "zoning", "opposition", "policy", "land", "labor"];
const allChecks = (over: Partial<Record<ValuationCheckId, ValuationCheck["status"]>> = {}): ValuationCheck[] =>
  CHECK_IDS.map((id) => ({ id, status: over[id] ?? "pass", detail: `${id} evidence (test fixture)` }));

/** Same-workload alternative: pricier land and electricity than the subject. */
const altOf = (siteId = "alt-1", over: Partial<ValuationInputs> = {}): Alternative => ({
  inputs: inputs(siteId, { askingPriceTotal: tag(2_000_000, "USD"), electricityUsdPerKwh: tag(0.11, "USD/kWh"), ...over }),
  checks: allChecks(),
});

// Numeric oracle: the model.ts kernel the engine is contracted to use.
const kernel = (over: Partial<TenYearCostInputs> = {}) => calculateTenYearCosts({
  mw: 1, avgLoad: 1, landUsd: 1_000_000, buildCostUsdPerW: 10, buildMultiplier: 1,
  utilityConnectUsd: 500_000, electricityUsdPerKwh: 0.1, waterUsdPerM3: 1,
  pue: 1.2, wueLPerItKwh: 2, maintenanceRate: 0.01, ...over,
});
const subjEvap = kernel();
const subjDry = kernel({ pue: 1.4, wueLPerItKwh: 0, buildMultiplier: 1.1 });
const altEvap = kernel({ electricityUsdPerKwh: 0.11, landUsd: 2_000_000 });
const expectedMax = breakEvenLandPricePerAcre(altEvap.totalPv, subjEvap.nonLandPv, 1);

const collectTags = (node: unknown, out: Tagged[] = []): Tagged[] => {
  if (!node || typeof node !== "object") return out;
  const rec = node as Record<string, unknown>;
  if ("kind" in rec && "unit" in rec && "value" in rec && "source" in rec) {
    out.push(rec as unknown as Tagged);
    return out;
  }
  for (const v of Object.values(rec)) collectTags(v, out);
  return out;
};

// ---------- tenYearPv ----------

describe("tenYearPv", () => {
  it("matches the model.ts kernel for complete inputs, with USD/year and USD units", () => {
    const bd = tenYearPv(inputs("s1"), "evaporative");
    expect(bd.land.value).toBeCloseTo(subjEvap.land, 0);
    expect(bd.build.value).toBeCloseTo(subjEvap.build, 0);
    expect(bd.utility.value).toBeCloseTo(subjEvap.utility, 0);
    expect(bd.annualPower.value).toBeCloseTo(subjEvap.annualPower, 0);
    expect(bd.annualWater.value).toBeCloseTo(subjEvap.annualWater, 0);
    expect(bd.annualMaintenance.value).toBeCloseTo(subjEvap.annualMaintenance, 0);
    expect(bd.powerPv.value).toBeCloseTo(subjEvap.powerPv, 0);
    expect(bd.waterPv.value).toBeCloseTo(subjEvap.waterPv, 0);
    expect(bd.maintenancePv.value).toBeCloseTo(subjEvap.maintenancePv, 0);
    expect(bd.nonLandPv.value).toBeCloseTo(subjEvap.nonLandPv, 0);
    expect(bd.totalPv.value).toBeCloseTo(subjEvap.totalPv, 0);
    expect(bd.missingInputs).toEqual([]);
    for (const annual of [bd.annualPower, bd.annualWater, bd.annualMaintenance]) expect(annual.unit).toBe("USD/year");
    for (const pv of [bd.land, bd.build, bd.utility, bd.powerPv, bd.waterPv, bd.maintenancePv, bd.nonLandPv, bd.totalPv]) {
      expect(pv.unit).toBe("USD");
    }
  });

  it("keeps non-land costs when land is missing: partial breakdown, null stays inside the tag", () => {
    const bd = tenYearPv(inputs("s1", { askingPriceTotal: tag(null, "USD") }), "evaporative");
    expect(bd.land.value).toBeNull();
    expect(bd.totalPv.value).toBeNull();
    expect(bd.nonLandPv.value).toBeCloseTo(subjEvap.nonLandPv, 0);
    expect(bd.build.value).toBeCloseTo(subjEvap.build, 0);
    expect(bd.powerPv.value).toBeCloseTo(subjEvap.powerPv, 0);
    expect(bd.missingInputs.join(" ")).toMatch(/asking|land/i);
  });

  it("never tags a computed cost as reported, keeps passthrough provenance, propagates assumed", () => {
    const bd = tenYearPv(inputs("s1", { maintenanceRate: tag(0.01, "ratio", "assumed") }), "evaporative");
    // land and utility are untouched echoes of reported inputs; everything else is computed.
    expect(bd.land.kind).toBe("reported");
    expect(bd.utility.kind).toBe("reported");
    const computed = [bd.build, bd.annualItKwh, bd.annualFacilityKwh, bd.annualWaterM3, bd.annualPower,
      bd.annualWater, bd.annualMaintenance, bd.powerPv, bd.waterPv, bd.maintenancePv, bd.nonLandPv, bd.totalPv];
    for (const t of computed) expect(t.kind).not.toBe("reported");
    expect(bd.maintenancePv.kind).toBe("assumed");
    expect(bd.totalPv.kind).toBe("assumed");
  });

  it.each([
    ["NaN mw", { mw: tag(NaN, "MW") }],
    ["negative mw", { mw: tag(-1, "MW") }],
    ["avgLoad above 1", { avgLoad: tag(1.5, "ratio") }],
    ["wrong electricity unit", { electricityUsdPerKwh: tag(0.1, "USD/MWh") }],
  ] as const)("treats %s as missing without throwing", (_name, over) => {
    const bd = tenYearPv(inputs("s1", over), "evaporative");
    expect(bd.missingInputs.length).toBeGreaterThan(0);
    for (const t of collectTags(bd)) if (t.value !== null) expect(Number.isFinite(t.value)).toBe(true);
  });
});

// ---------- valueProperty: verdicts ----------

describe("valueProperty verdicts", () => {
  it("Buys below the maximum: break-even per acre, cheapest alternative, evaporative selected", () => {
    const v = valueProperty(inputs("subject"), allChecks(), [altOf()]);
    expect(v.verdict).toBe("buy");
    expect(v.nextBestSiteId).toBe("alt-1");
    expect(v.maxLandPricePerAcre.value).toBeCloseTo(expectedMax, 0);
    expect(v.maxLandPricePerAcre.unit).toBe("USD/acre");
    expect(v.askingPricePerAcre.value).toBeCloseTo(1_000_000, 0);
    expect(v.askingPricePerAcre.unit).toBe("USD/acre");
    expect(v.tenYearCost.value).toBeCloseTo(subjEvap.totalPv, 0);
    expect(v.nextBestTenYearCost.value).toBeCloseTo(altEvap.totalPv, 0);
    expect(v.recommendedCooling).toBe("evaporative");
    expect(v.missingInputs).toEqual([]);
    expect(v.sampleTainted).toBe(false);
    expect(v.reasons.length).toBeGreaterThan(0);
    expect(v.sensitivities.coolingDeltaPv.value).toBeCloseTo(subjEvap.totalPv - subjDry.totalPv, 0);
  });

  it("treats asking exactly at the maximum as Buy, one dollar over as Pass", () => {
    const first = valueProperty(inputs("subject"), allChecks(), [altOf()]);
    const max = first.maxLandPricePerAcre.value!;
    const atMax = valueProperty(inputs("subject", { askingPriceTotal: tag(max, "USD") }), allChecks(), [altOf()]);
    expect(atMax.verdict).toBe("buy");
    const overMax = valueProperty(inputs("subject", { askingPriceTotal: tag(max + 1, "USD") }), allChecks(), [altOf()]);
    expect(overMax.verdict).toBe("pass");
  });

  it("keeps a negative maximum visible and Passes: even free land loses", () => {
    const cheapAlt = altOf("alt-cheap", { askingPriceTotal: tag(100, "USD"), electricityUsdPerKwh: tag(0.01, "USD/kWh") });
    const altPv = kernel({ electricityUsdPerKwh: 0.01, landUsd: 100 }).totalPv;
    const v = valueProperty(inputs("subject"), allChecks(), [cheapAlt]);
    expect(v.verdict).toBe("pass");
    expect(v.maxLandPricePerAcre.value).toBeLessThan(0);
    expect(v.maxLandPricePerAcre.value).toBeCloseTo(breakEvenLandPricePerAcre(altPv, subjEvap.nonLandPv, 1), 0);
  });

  it("still Buys on watch checks but says why", () => {
    const v = valueProperty(inputs("subject"), allChecks({ power: "watch", zoning: "watch" }), [altOf()]);
    expect(v.verdict).toBe("buy");
    expect(v.reasons.join(" ")).toMatch(/watch/i);
  });

  it("a failed check overrides missing inputs: Pass, not Maybe", () => {
    const v = valueProperty(
      inputs("subject", { electricityUsdPerKwh: tag(null, "USD/kWh") }),
      allChecks({ water: "fail" }),
      [altOf()],
    );
    expect(v.verdict).toBe("pass");
  });

  it.each([
    ["an omitted check", allChecks().filter((c) => c.id !== "labor")],
    ["an unknown check", allChecks({ labor: "unknown" })],
  ])("caps at Maybe with %s", (_name, checks) => {
    expect(valueProperty(inputs("subject"), checks, [altOf()]).verdict).toBe("maybe");
  });

  it("never Buys on duplicate conflicting check ids; duplicate fail still Passes", () => {
    const conflicted = [...allChecks(), { id: "power", status: "watch", detail: "duplicate" } as ValuationCheck];
    expect(valueProperty(inputs("subject"), conflicted, [altOf()]).verdict).not.toBe("buy");
    const withFail = [...allChecks(), { id: "power", status: "fail", detail: "duplicate" } as ValuationCheck];
    expect(valueProperty(inputs("subject"), withFail, [altOf()]).verdict).toBe("pass");
  });

  it("caps at Maybe when a priced input is missing, and names it", () => {
    const v = valueProperty(inputs("subject", { electricityUsdPerKwh: tag(null, "USD/kWh") }), allChecks(), [altOf()]);
    expect(v.verdict).toBe("maybe");
    expect(v.missingInputs.join(" ")).toMatch(/electricity/i);
  });

  it("handles cooling eligibility: unknown is Maybe, both-false is Pass, one false still Buys on the other", () => {
    const unknownEvap = inputs("subject", {
      cooling: { evaporative: coolingInputs(1.2, 2, 1, null), dry: coolingInputs(1.4, 0, 1.1) },
    });
    expect(valueProperty(unknownEvap, allChecks(), [altOf()]).verdict).toBe("maybe");

    const neither = inputs("subject", {
      cooling: { evaporative: coolingInputs(1.2, 2, 1, false), dry: coolingInputs(1.4, 0, 1.1, false) },
    });
    expect(valueProperty(neither, allChecks(), [altOf()]).verdict).toBe("pass");

    const dryOnly = inputs("subject", {
      askingPriceTotal: tag(500_000, "USD"),
      cooling: { evaporative: coolingInputs(1.2, 2, 1, false), dry: coolingInputs(1.4, 0, 1.1) },
    });
    const v = valueProperty(dryOnly, allChecks(), [altOf()]);
    expect(v.verdict).toBe("buy");
    expect(v.recommendedCooling).toBe("dry");
    expect(v.maxLandPricePerAcre.value).toBeCloseTo(breakEvenLandPricePerAcre(altEvap.totalPv, subjDry.nonLandPv, 1), 0);
  });
});

// ---------- valueProperty: alternatives ----------

describe("valueProperty alternatives", () => {
  it.each([
    ["itself", altOf("subject")],
    ["a different workload", altOf("alt-mw", { mw: tag(2, "MW") })],
    ["a failed site", { ...altOf("alt-fail"), checks: allChecks({ water: "fail" }) }],
    ["a sample fixture priced against a real subject", altOf("alt-sample", { askingPriceTotal: tag(2_000_000, "USD", "sample") })],
  ])("excludes %s: no maximum, Maybe", (_name, alternative) => {
    const v = valueProperty(inputs("subject"), allChecks(), [alternative]);
    expect(v.verdict).toBe("maybe");
    expect(v.maxLandPricePerAcre.value).toBeNull();
    expect(v.nextBestSiteId).toBeNull();
  });

  it("benchmarks against the cheapest eligible alternative", () => {
    const cheaper = altOf("alt-2", { askingPriceTotal: tag(1_500_000, "USD") });
    const v = valueProperty(inputs("subject"), allChecks(), [altOf("alt-1"), cheaper]);
    expect(v.nextBestSiteId).toBe("alt-2");
    const alt2Pv = kernel({ electricityUsdPerKwh: 0.11, landUsd: 1_500_000 }).totalPv;
    expect(v.maxLandPricePerAcre.value).toBeCloseTo(breakEvenLandPricePerAcre(alt2Pv, subjEvap.nonLandPv, 1), 0);
    expect(v.verdict).toBe("buy");
  });

  it("is Maybe with no alternatives at all", () => {
    const v = valueProperty(inputs("subject"), allChecks(), []);
    expect(v.verdict).toBe("maybe");
    expect(v.maxLandPricePerAcre.value).toBeNull();
  });
});

// ---------- sensitivities ----------

describe("electricity and cooling sensitivities", () => {
  const v = () => valueProperty(inputs("subject"), allChecks(), [altOf()]);

  it("prices -20%/baseline/+20% with assumed multipliers, subject repriced, alternative fixed", () => {
    const rows = v().sensitivities.electricity;
    expect(rows.map((r) => r.electricityMultiplier.value)).toEqual([0.8, 1, 1.2]);
    for (const r of rows) expect(r.electricityMultiplier.kind).toBe("assumed");
    expect(rows[0].electricityUsdPerKwh.value).toBeCloseTo(0.08, 10);
    expect(rows[2].electricityUsdPerKwh.value).toBeCloseTo(0.12, 10);
    expect(rows[0].totalPv.value!).toBeLessThan(rows[1].totalPv.value!);
    expect(rows[1].totalPv.value!).toBeLessThan(rows[2].totalPv.value!);
    expect(rows[0].maxLandPricePerAcre.value!).toBeGreaterThan(rows[1].maxLandPricePerAcre.value!);
    expect(rows[1].maxLandPricePerAcre.value!).toBeGreaterThan(rows[2].maxLandPricePerAcre.value!);
  });

  it("agrees with the headline numbers at the baseline multiplier", () => {
    const out = v();
    const base = out.sensitivities.electricity.find((r) => r.electricityMultiplier.value === 1)!;
    expect(base.totalPv.value).toBeCloseTo(out.tenYearCost.value!, 0);
    expect(base.totalPvDelta.value).toBeCloseTo(0, 0);
    expect(base.maxLandPricePerAcre.value).toBeCloseTo(out.maxLandPricePerAcre.value!, 0);
    expect(base.verdict).toBe(out.verdict);
    expect(out.sensitivities.scope).toBe("subject-electricity-only-fixed-cooling-and-alternative");
  });
});

// ---------- sample protection ----------

describe("sample protection", () => {
  it("sampleValuation tags every number sample, including policy constants", () => {
    const s = sampleValuation();
    expect(s.sampleTainted).toBe(true);
    expect(["buy", "maybe", "pass"]).toContain(s.verdict);
    const tags = collectTags(s);
    expect(tags.length).toBeGreaterThan(10);
    for (const t of tags) expect(t.kind).toBe("sample");
    expect(s.analysisYears.value).toBe(10);
    expect(s.discountRate.value).toBe(0.08);
  });

  it("tags real valuations' policy constants as assumed 10 years at 8%", () => {
    const v = valueProperty(inputs("subject"), allChecks(), [altOf()]);
    expect(v.analysisYears).toMatchObject({ value: 10, kind: "assumed" });
    expect(v.discountRate).toMatchObject({ value: 0.08, kind: "assumed" });
    expect(v.sampleTainted).toBe(false);
  });

  it("marks a valuation tainted when any consumed input is sample", () => {
    const v = valueProperty(inputs("subject", { waterUsdPerM3: tag(2, "USD/m3", "sample") }), allChecks(), []);
    expect(v.sampleTainted).toBe(true);
    expect(v.cooling.evaporative.waterPv.kind).toBe("sample");
    expect(v.cooling.evaporative.totalPv.kind).toBe("sample");
  });
});
