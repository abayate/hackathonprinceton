import { describe, expect, it } from "vitest";
import { band, displayScore, economics, money, stoppedShareForBand, presentValueAnnualCost, calculateTenYearCosts, breakEvenLandPricePerAcre, type TenYearCostInputs } from "./model";
import type { BandOutcomes } from "./modelCard";

const bandOutcomes: BandOutcomes = {
  thresholds: { watch: 0.4, red: 0.6 },
  repeatCount: 20,
  countBasis: "Pooled out-of-fold predictions",
  bands: {
    green: { count: 1014, stoppedCount: 60, rate: 0.059172, repeatMin: 0.04, repeatMax: 0.08, repeatsWithObservations: 20 },
    watch: { count: 479, stoppedCount: 84, rate: 0.175365, repeatMin: 0.12, repeatMax: 0.23, repeatsWithObservations: 20 },
    red: { count: 547, stoppedCount: 176, rate: 0.321755, repeatMin: 0.26, repeatMax: 0.39, repeatsWithObservations: 20 },
  },
};

describe("risk bands", () => {
  it.each([[0, 0], [0.3999, 39], [0.4, 40], [0.596, 59], [0.5999, 59], [0.6, 60], [1, 100]] as const)("floors displayed %s to %s without crossing a band", (score, expected) => {
    expect(displayScore(score)).toBe(expected);
    expect(band(displayScore(score)! / 100)).toBe(band(score));
  });
  it.each([null, undefined, NaN, Infinity, -0.1, 1.1])("keeps invalid score %s undisplayed", (score) => expect(displayScore(score)).toBeNull());
  it.each([[null, null], [0, "green"], [0.3999, "green"], [0.4, "watch"], [0.5999, "watch"], [0.6, "red"], [1, "red"]] as const)(
    "classifies %s as %s", (p, result) => expect(band(p)).toBe(result),
  );
});

describe("100 MW scenario economics", () => {
  it.each([0, 0.25, 0.5, 1])("scales delay exposure at score %s", (p) => {
    const result = economics(p, 100);
    expect(result.buildCost).toBe(1_051_000_000);
    expect(result.annualPower).toBeCloseTo(53_054_064, 2);
    expect(result.monthlyLease).toBe(17_000_000);
    expect(result.expectedDelayMonths).toBe(12 * p);
    expect(result.expectedDelayCost).toBe(204_000_000 * p);
  });
  it("preserves unknown risk without hiding the scenario costs", () => {
    expect(economics(null, 100)).toMatchObject({ expectedDelayMonths: null, expectedDelayCost: null, monthlyLease: 17_000_000 });
  });
  it("scales the scenario linearly with load", () => {
    const small = economics(0.5, 50);
    const large = economics(0.5, 100);
    expect(small.buildCost).toBe(large.buildCost / 2);
    expect(small.expectedDelayCost).toBe(large.expectedDelayCost! / 2);
    expect(small.expectedDelayMonths).toBe(large.expectedDelayMonths);
  });
});

describe("band observed stopped share", () => {
  it.each([
    ["green", 0.059172, 12_071_088],
    ["watch", 0.175365, 35_774_460],
    ["red", 0.321755, 65_638_020],
  ] as const)("uses the artifact stopped share for %s", (riskBand, share, exposure) => {
    expect(stoppedShareForBand(riskBand, bandOutcomes)).toBe(share);
    expect(economics(stoppedShareForBand(riskBand, bandOutcomes), 100).expectedDelayCost).toBe(exposure);
  });
  it("keeps missing scores unscored", () => {
    expect(stoppedShareForBand(null, bandOutcomes)).toBeNull();
    expect(economics(stoppedShareForBand(null, bandOutcomes), 100).expectedDelayCost).toBeNull();
  });
  it("returns an unknown share when a band has no observations", () => {
    const empty = {
      ...bandOutcomes,
      bands: {
        ...bandOutcomes.bands,
        green: { ...bandOutcomes.bands.green, count: 0, stoppedCount: 0, rate: null, repeatMin: null, repeatMax: null, repeatsWithObservations: 0 },
      },
    };
    expect(stoppedShareForBand("green", empty)).toBeNull();
    expect(economics(stoppedShareForBand("green", empty), 100).expectedDelayCost).toBeNull();
  });
});

describe("money", () => {
  it.each([[null, "Unknown"], [undefined, "Unknown"], [NaN, "Unknown"], [0, "$0"], [999, "$999"], [1000, "$1K"], [1e6, "$1M"], [1.051e9, "$1.1B"], [-17000, "$-17K"]])(
    "formats %s as %s", (input, result) => expect(money(input as number | null | undefined)).toBe(result),
  );
});

// Synthetic worked examples, not verified market or property inputs.
const financeInput: TenYearCostInputs = {
  mw: 10, avgLoad: 1, landUsd: 2_000_000, buildCostUsdPerW: 11,
  buildMultiplier: 1, utilityConnectUsd: 3_000_000, electricityUsdPerKwh: 0.12,
  waterUsdPerM3: 2, pue: 1.2, wueLPerItKwh: 1.8, maintenanceRate: 0.02,
};

describe("discounted facility costs", () => {
  it("discounts annual payments at year end, including the zero-rate case", () => {
    expect(presentValueAnnualCost(100, 2, 0.1)).toBeCloseTo(100 / 1.1 + 100 / 1.21, 10);
    expect(presentValueAnnualCost(100, 10, 0)).toBe(1000);
    expect(presentValueAnnualCost(1)).toBeCloseTo(6.710081398941448, 12);
    expect(presentValueAnnualCost(0)).toBe(0);
    expect(presentValueAnnualCost(100, 2, 1e-12)).toBeCloseTo(200, 6);
  });
  it("matches a hand-calculated ten-year example with separate utility capex", () => {
    const result = calculateTenYearCosts(financeInput);
    expect(result).toMatchObject({
      land: 2_000_000, build: 110_000_000, utility: 3_000_000,
      annualItKwh: 87_600_000, annualFacilityKwh: 105_120_000,
      annualWaterM3: 157_680, annualPower: 12_614_400,
      annualWater: 315_360, annualMaintenance: 2_200_000,
    });
    const annuity = 6.710081398941448;
    expect(result.totalPv).toBeCloseTo(115_000_000 + 15_129_760 * annuity, 6);
    expect(result.totalPv - result.nonLandPv).toBeCloseTo(2_000_000, 6);
    expect(result.powerPv).toBeCloseTo(12_614_400 * annuity, 6);
    expect(result.waterPv).toBeCloseTo(315_360 * annuity, 6);
    expect(result.maintenancePv).toBeCloseTo(2_200_000 * annuity, 6);
  });
  it("uses IT kWh for water and makes the dry-cooling tradeoff explicit", () => {
    const wet = calculateTenYearCosts(financeInput);
    const dry = calculateTenYearCosts({ ...financeInput, pue: 1.35, wueLPerItKwh: 0.1, buildMultiplier: 1.05 });
    expect(dry.annualWaterM3).toBe(8760);
    expect(dry.annualPower).toBeGreaterThan(wet.annualPower);
    expect(dry.build).toBe(115_500_000);
    expect(calculateTenYearCosts({ ...financeInput, pue: 2 }).annualWaterM3).toBe(wet.annualWaterM3);
  });
  it("isolates acquisition cost from maintenance and preserves zero cost inputs", () => {
    const result = calculateTenYearCosts({ ...financeInput, landUsd: 0, utilityConnectUsd: 0, electricityUsdPerKwh: 0, waterUsdPerM3: 0, maintenanceRate: 0 });
    expect(result.totalPv).toBe(result.build);
    expect(calculateTenYearCosts({ ...financeInput, landUsd: 50_000_000 }).annualMaintenance).toBe(2_200_000);
    expect(calculateTenYearCosts({ ...financeInput, utilityConnectUsd: 50_000_000 }).annualMaintenance).toBe(2_200_000);
  });
  it("scales energy and build with workload, and leaves fixed utility and land separate", () => {
    const a = calculateTenYearCosts(financeInput);
    const b = calculateTenYearCosts({ ...financeInput, mw: 20 });
    expect(b.nonLandPv - b.utility).toBeCloseTo(2 * (a.nonLandPv - a.utility), 6);
    expect(calculateTenYearCosts({ ...financeInput, electricityUsdPerKwh: 0.2 }).totalPv).toBeGreaterThan(a.totalPv);
    expect(calculateTenYearCosts({ ...financeInput, avgLoad: 0.5 }).annualWater).toBe(a.annualWater / 2);
  });
  it("does not mutate its input", () => {
    const frozen = Object.freeze({ ...financeInput });
    calculateTenYearCosts(frozen);
    expect(frozen).toEqual(financeInput);
  });
  it.each([
    ["mw", 0], ["mw", -1], ["mw", Infinity], ["avgLoad", 0], ["avgLoad", 1.01],
    ["pue", 0.99], ["buildMultiplier", 0], ["maintenanceRate", 1.1],
    ["landUsd", -1], ["waterUsdPerM3", NaN], ["utilityConnectUsd", -1],
    ["electricityUsdPerKwh", -1], ["wueLPerItKwh", -1], ["buildCostUsdPerW", -1],
  ] as const)("rejects invalid %s = %s", (key, value) => {
    expect(() => calculateTenYearCosts({ ...financeInput, [key]: value })).toThrow(RangeError);
  });
  it.each([[NaN, 10, 0.08], [-1, 10, 0.08], [100, 0, 0.08], [100, 1.5, 0.08], [100, Infinity, 0.08], [100, 101, 0.08], [100, 10, -0.1], [100, 10, NaN]])(
    "rejects invalid annuity arguments %s / %s / %s", (cost, years, rate) => {
      expect(() => presentValueAnnualCost(cost, years, rate)).toThrow(RangeError);
    },
  );
  it("rejects overflow instead of returning Infinity", () => {
    expect(() => calculateTenYearCosts({ ...financeInput, mw: Number.MAX_VALUE })).toThrow(RangeError);
    expect(() => presentValueAnnualCost(Number.MAX_VALUE, 10, 0)).toThrow(RangeError);
  });
});

describe("break-even land bid", () => {
  it("solves the cost equality rather than relabeling the asking price", () => {
    const subject = calculateTenYearCosts(financeInput);
    const alternative = calculateTenYearCosts({ ...financeInput, landUsd: 5_000_000 });
    const bid = breakEvenLandPricePerAcre(alternative.totalPv, subject.nonLandPv, 20);
    expect(bid).toBeCloseTo(250_000, 6);
    expect(calculateTenYearCosts({ ...financeInput, landUsd: bid * 20 }).totalPv).toBeCloseTo(alternative.totalPv, 6);
  });
  it("preserves a negative break-even and exact zero", () => {
    expect(breakEvenLandPricePerAcre(100, 200, 10)).toBe(-10);
    expect(breakEvenLandPricePerAcre(100, 100, 10)).toBe(0);
  });
  it.each([[100, 200, 0], [100, 200, -1], [NaN, 200, 10], [100, Infinity, 10], [-1, 200, 10], [100, -1, 10], [Number.MAX_VALUE, 0, Number.MIN_VALUE]])(
    "rejects invalid or overflowing break-even inputs", (alternative, subject, acres) => {
      expect(() => breakEvenLandPricePerAcre(alternative, subject, acres)).toThrow(RangeError);
    },
  );
});
