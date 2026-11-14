import { describe, expect, it } from "vitest";
import { sampleValuation, valueProperty, tenYearPv } from "./valuation";
import type { Tagged, ValuationInputs, ValuationCheck } from "./valuationTypes";

const n = (value: number | null, unit: string): Tagged => ({ value, unit, kind: "reported", source: "test-fixture" });
const inputs: ValuationInputs = {
  siteId: "a", mw: n(10, "MW"), acres: n(20, "acre"), askingPriceTotal: n(2e6, "USD"),
  buildCostUsdPerW: n(11, "USD/W"), utilityConnectUsd: n(3e6, "USD"),
  electricityUsdPerKwh: n(0.12, "USD/kWh"), waterUsdPerM3: n(2, "USD/m3"),
  maintenanceRate: n(0.02, "ratio"), avgLoad: n(1, "ratio"),
  cooling: {
    evaporative: { eligible: true, pue: n(1.2, "kWh/kWh"), wueLPerItKwh: n(1.8, "L/kWh"), buildMultiplier: n(1, "ratio") },
    dry: { eligible: true, pue: n(1.35, "kWh/kWh"), wueLPerItKwh: n(0.1, "L/kWh"), buildMultiplier: n(1.05, "ratio") },
  },
};
const checks: readonly ValuationCheck[] = (["power", "water", "zoning", "opposition", "policy", "land", "labor"] as const)
  .map(id => ({ id, status: "pass", detail: "Synthetic verified check" }));
const alternative = { inputs: { ...inputs, siteId: "b", askingPriceTotal: n(5e6, "USD") }, checks };

describe("valuation integration", () => {
  it("feeds the contract from real formulas and solves a reproducible maximum bid", () => {
    const result = valueProperty(inputs, checks, [alternative]);
    expect(result.verdict).toBe("buy");
    expect(result.maxLandPricePerAcre.value).toBeCloseTo(250000, 5);
    expect(result.nextBestSiteId).toBe("b");
    expect(result.tenYearCost.value).toBeCloseTo(115e6 + 15129760 * 6.710081398941448, 5);
    const atMax = valueProperty({ ...inputs, askingPriceTotal: n(result.maxLandPricePerAcre.value! * 20, "USD") }, checks, [alternative]);
    expect(atMax.tenYearCost.value).toBeCloseTo(result.nextBestTenYearCost.value!, 5);
    expect(atMax.verdict).toBe("buy");
    expect(valueProperty({ ...inputs, askingPriceTotal: n(result.maxLandPricePerAcre.value! * 20 + 1, "USD") }, checks, [alternative]).verdict).toBe("pass");
  });
  it("keeps known non-land costs when acquisition price is unknown", () => {
    const subject = { ...inputs, askingPriceTotal: n(null, "USD") };
    const breakdown = tenYearPv(subject, "evaporative");
    expect(breakdown.totalPv.value).toBeNull();
    expect(breakdown.nonLandPv.value).not.toBeNull();
    const result = valueProperty(subject, checks, [alternative]);
    expect(result.maxLandPricePerAcre.value).toBeCloseTo(250000, 5);
    expect(result.verdict).toBe("maybe");
  });
  it("keeps unknown diligence as Maybe and known failures as Pass", () => {
    expect(valueProperty(inputs, checks.slice(1), [alternative]).verdict).toBe("maybe");
    expect(valueProperty(inputs, [{ id: "power", status: "fail", detail: "No capacity" }], []).verdict).toBe("pass");
  });
  it("never allows NaN, bad units, or a failed alternative to create a bid", () => {
    expect(valueProperty({ ...inputs, acres: n(NaN, "acre") }, checks, [alternative]).maxLandPricePerAcre.value).toBeNull();
    expect(valueProperty({ ...inputs, electricityUsdPerKwh: n(12, "cents/kWh") }, checks, [alternative]).verdict).toBe("maybe");
    expect(valueProperty(inputs, checks, [{ ...alternative, checks: [{ id: "power", status: "fail", detail: "No capacity" }] }]).maxLandPricePerAcre.value).toBeNull();
  });
  it("uses the real engine for an entirely sample-tagged JSON-safe demo", () => {
    const sample = sampleValuation();
    expect(sample.sampleTainted).toBe(true);
    expect(sample.verdict).toBe("buy");
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if ("value" in record) expect(record.kind).toBe("sample");
        Object.entries(record).filter(([key]) => key !== "value").forEach(([, child]) => visit(child));
      } else expect(typeof value).not.toBe("number");
    };
    visit(sample);
    expect(JSON.parse(JSON.stringify(sample))).toEqual(sample);
  });
  it("does not set a ceiling using an incomplete cooling comparison", () => {
    const subject = { ...inputs, askingPriceTotal: n(100e6, "USD"), cooling: {
      ...inputs.cooling, evaporative: { ...inputs.cooling.evaporative, eligible: null },
    } };
    const result = valueProperty(subject, checks, [alternative]);
    expect(result.verdict).toBe("maybe");
    expect(result.maxLandPricePerAcre.value).toBeNull();
    expect(result.sensitivities.electricity.every(row => row.maxLandPricePerAcre.value === null)).toBe(true);
  });
  it("excludes ambiguous alternative identities and differing average workload", () => {
    expect(valueProperty(inputs, checks, [alternative, alternative]).nextBestSiteId).toBeNull();
    expect(valueProperty(inputs, checks, [{ ...alternative, inputs: { ...alternative.inputs, avgLoad: n(0.5, "ratio") } }]).nextBestSiteId).toBeNull();
  });
  it("keeps reported acquisition and utility quotes reported, while computed costs inherit assumptions", () => {
    const costs = tenYearPv(inputs, "evaporative");
    expect(costs.land).toEqual(inputs.askingPriceTotal);
    expect(costs.utility).toEqual(inputs.utilityConnectUsd);
    expect(costs.build.kind).toBe("modeled");
    expect(costs.totalPv.kind).toBe("assumed"); // Explicit 8% discount-rate assumption.
  });
  it("rejects malformed provenance, overflow and invalid check statuses without a Buy", () => {
    const malformed = { ...inputs, electricityUsdPerKwh: { ...inputs.electricityUsdPerKwh, kind: "unknown" } } as unknown as ValuationInputs;
    expect(valueProperty(malformed, checks, [alternative]).verdict).toBe("maybe");
    expect(valueProperty({ ...inputs, buildCostUsdPerW: n(Number.MAX_VALUE, "USD/W") }, checks, [alternative]).verdict).toBe("maybe");
    const invalidChecks = checks.map(check => check.id === "power" ? { ...check, status: "unchecked" } : check) as readonly ValuationCheck[];
    expect(valueProperty(inputs, invalidChecks, [alternative]).verdict).toBe("maybe");
  });
});
