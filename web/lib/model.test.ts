import { describe, expect, it } from "vitest";
import { band, displayScore, economics, money, stoppedShareForBand } from "./model";
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
