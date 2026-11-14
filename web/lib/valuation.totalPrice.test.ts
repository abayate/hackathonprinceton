import { describe, expect, it } from "vitest";
import { breakEvenLandPricePerAcre, calculateTenYearCosts, type TenYearCostInputs } from "./model";
import type { Alternative, Tagged, ValuationCheck, ValuationCheckId, ValuationInputs } from "./valuationTypes";
import { valueProperty } from "./valuation";

/**
 * Regression contract for the land-price ceiling as a TOTAL price:
 *   maxLandPricePerAcre * subject acres === alternative selected totalPv - subject selected nonLandPv
 * The ceiling must depend on the subject's acreage and non-land costs and the
 * alternative's all-in cost — never on the subject's asking price
 * or the alternative's acreage.
 */

// ---------- independent fixtures (not shared with other test files) ----------

const tag = (value: number | null, unit: string, kind: Tagged["kind"] = "reported"): Tagged =>
  ({ value, unit, kind, source: "totalPrice-test-fixture" });

const coolingOf = (pue: number, wue: number, mult: number, eligible: boolean | null = true) =>
  ({ eligible, pue: tag(pue, "kWh/kWh"), wueLPerItKwh: tag(wue, "L/kWh"), buildMultiplier: tag(mult, "ratio") });

const ACRES = 0.18; // deliberately tiny: per-acre numbers are ~5.6x the totals, so unit mistakes amplify

/** 2 MW at 90% load on a tiny 0.18-acre parcel; dry cooling is clearly more expensive. */
const inputsOf = (siteId: string, over: Partial<ValuationInputs> = {}): ValuationInputs => ({
  siteId,
  mw: tag(2, "MW"),
  acres: tag(ACRES, "acre"),
  askingPriceTotal: tag(900_000, "USD"),
  buildCostUsdPerW: tag(9, "USD/W"),
  utilityConnectUsd: tag(400_000, "USD"),
  electricityUsdPerKwh: tag(0.09, "USD/kWh"),
  waterUsdPerM3: tag(1.5, "USD/m3"),
  maintenanceRate: tag(0.015, "ratio"),
  avgLoad: tag(0.9, "ratio"),
  cooling: { evaporative: coolingOf(1.15, 1.9, 1), dry: coolingOf(1.45, 0, 1.25) },
  ...over,
});

const CHECK_IDS: readonly ValuationCheckId[] = ["power", "water", "zoning", "opposition", "policy", "land", "labor"];
const allChecks = (): ValuationCheck[] =>
  CHECK_IDS.map((id) => ({ id, status: "pass", detail: `${id} evidence (test fixture)` }));

/** Same-workload alternative on a large parcel with pricier land and electricity. */
const alternativeOf = (siteId = "tp-alt", over: Partial<ValuationInputs> = {}): Alternative => ({
  inputs: inputsOf(siteId, {
    acres: tag(40, "acre"),
    askingPriceTotal: tag(3_000_000, "USD"),
    electricityUsdPerKwh: tag(0.105, "USD/kWh"),
    ...over,
  }),
  checks: allChecks(),
});

// ---------- numeric oracle: the same model.ts kernel the engine is contracted to use ----------

const kernel = (over: Partial<TenYearCostInputs> = {}) => calculateTenYearCosts({
  mw: 2, avgLoad: 0.9, landUsd: 900_000, buildCostUsdPerW: 9, buildMultiplier: 1,
  utilityConnectUsd: 400_000, electricityUsdPerKwh: 0.09, waterUsdPerM3: 1.5,
  pue: 1.15, wueLPerItKwh: 1.9, maintenanceRate: 0.015, ...over,
});
const dryOver = { pue: 1.45, wueLPerItKwh: 0, buildMultiplier: 1.25 } as const;

/** Mirrors the engine's design selection: cheapest nonLandPv wins, evaporative on ties. */
const selectedOf = (over: Partial<TenYearCostInputs> = {}) => {
  const evap = kernel(over);
  const dry = kernel({ ...dryOver, ...over });
  return evap.nonLandPv <= dry.nonLandPv ? evap : dry;
};

const subjectNonLandPv = selectedOf().nonLandPv;
const altTotalPv = selectedOf({ electricityUsdPerKwh: 0.105, landUsd: 3_000_000 }).totalPv;

// ---------- the identity on a tiny parcel ----------

describe("maxLandPricePerAcre is a per-acre slice of a total-price gap", () => {
  it("ceiling * 0.18 acres equals alternative total PV minus subject selected non-land PV", () => {
    const v = valueProperty(inputsOf("tp-subject"), allChecks(), [alternativeOf()]);
    expect(v.recommendedCooling).toBe("evaporative");
    expect(v.maxLandPricePerAcre.unit).toBe("USD/acre");
    expect(v.maxLandPricePerAcre.kind).not.toBe("reported");
    expect(v.maxLandPricePerAcre.note).toBeTruthy();

    // Against the independent oracle.
    expect(v.maxLandPricePerAcre.value).toBeCloseTo(breakEvenLandPricePerAcre(altTotalPv, subjectNonLandPv, ACRES), 6);
    expect(v.maxLandPricePerAcre.value! * ACRES).toBeCloseTo(altTotalPv - subjectNonLandPv, 4);

    // And reconstructed purely from the valuation's own reported figures.
    const ownNonLandPv = v.cooling[v.recommendedCooling!].nonLandPv.value!;
    expect(v.maxLandPricePerAcre.value! * v.acres.value!)
      .toBeCloseTo(v.nextBestTenYearCost.value! - ownNonLandPv, 4);
  });

  it("ignores the alternative's acreage: the benchmark is its total PV, not a per-acre figure", () => {
    const big = valueProperty(inputsOf("tp-subject"), allChecks(), [alternativeOf("tp-alt", { acres: tag(40, "acre") })]);
    const small = valueProperty(inputsOf("tp-subject"), allChecks(), [alternativeOf("tp-alt", { acres: tag(0.5, "acre") })]);
    expect(big.maxLandPricePerAcre.value).toBeCloseTo(small.maxLandPricePerAcre.value!, 6);
  });
});

// ---------- acquisition prices ----------

describe("acquisition prices and the ceiling", () => {
  it("subject asking price never moves the ceiling, only the verdict side of the comparison", () => {
    const valuations = [tag(900_000, "USD"), tag(4_300_000, "USD"), tag(null, "USD")].map((askingPriceTotal) =>
      valueProperty(inputsOf("tp-subject", { askingPriceTotal }), allChecks(), [alternativeOf()]));
    const [cheap, dear, unknown] = valuations.map((v) => v.maxLandPricePerAcre.value);
    expect(cheap).not.toBeNull();
    expect(dear).toBeCloseTo(cheap!, 6);
    // Unknown asking still yields a ceiling (Maybe verdict), it does not erase the bid guidance.
    expect(unknown).toBeCloseTo(cheap!, 6);
    expect(valuations[2].verdict).toBe("maybe");
  });

  it("reports asking per acre as total / acres on the tiny parcel", () => {
    const v = valueProperty(inputsOf("tp-subject"), allChecks(), [alternativeOf()]);
    expect(v.askingPricePerAcre.value).toBeCloseTo(900_000 / ACRES, 4);
    expect(v.askingPricePerAcre.unit).toBe("USD/acre");
  });

  it("a dearer alternative raises the ceiling by exactly the price delta spread over subject acres", () => {
    const base = valueProperty(inputsOf("tp-subject"), allChecks(), [alternativeOf("tp-alt", { askingPriceTotal: tag(3_000_000, "USD") })]);
    const dearer = valueProperty(inputsOf("tp-subject"), allChecks(), [alternativeOf("tp-alt", { askingPriceTotal: tag(3_750_000, "USD") })]);
    expect(dearer.maxLandPricePerAcre.value! - base.maxLandPricePerAcre.value!)
      .toBeCloseTo(750_000 / ACRES, 4);
  });
});

// ---------- bidding exactly the ceiling ----------

describe("bidding the total ceiling", () => {
  it("asking == ceiling * acres makes the subject's ten-year cost exactly the alternative's, and still Buys", () => {
    const first = valueProperty(inputsOf("tp-subject"), allChecks(), [alternativeOf()]);
    const ceilingTotal = first.maxLandPricePerAcre.value! * ACRES;
    expect(ceilingTotal).toBeGreaterThan(0);

    const atCeiling = valueProperty(
      inputsOf("tp-subject", { askingPriceTotal: tag(ceilingTotal, "USD") }), allChecks(), [alternativeOf()]);
    expect(atCeiling.verdict).toBe("buy");
    expect(atCeiling.tenYearCost.value).toBeCloseTo(altTotalPv, 3);
    expect(atCeiling.tenYearCost.value).toBeCloseTo(atCeiling.nextBestTenYearCost.value!, 3);
  });

  it("one dollar of total price above the ceiling flips Buy to Pass on a tiny parcel", () => {
    const first = valueProperty(inputsOf("tp-subject"), allChecks(), [alternativeOf()]);
    const ceilingTotal = first.maxLandPricePerAcre.value! * ACRES;
    const over = valueProperty(
      inputsOf("tp-subject", { askingPriceTotal: tag(ceilingTotal + 1, "USD") }), allChecks(), [alternativeOf()]);
    expect(over.verdict).toBe("pass");
  });
});

// ---------- negative ceilings ----------

describe("negative ceilings", () => {
  it("keeps the identity when even free land loses, and Passes", () => {
    const cheapAlt = alternativeOf("tp-alt-cheap", {
      askingPriceTotal: tag(1_000, "USD"), electricityUsdPerKwh: tag(0.01, "USD/kWh") });
    const cheapAltTotalPv = selectedOf({ electricityUsdPerKwh: 0.01, landUsd: 1_000 }).totalPv;
    expect(cheapAltTotalPv).toBeLessThan(subjectNonLandPv); // fixture sanity: this is the negative case

    const v = valueProperty(inputsOf("tp-subject"), allChecks(), [cheapAlt]);
    expect(v.verdict).toBe("pass");
    expect(v.maxLandPricePerAcre.value).toBeLessThan(0);
    expect(v.maxLandPricePerAcre.value! * ACRES).toBeCloseTo(cheapAltTotalPv - subjectNonLandPv, 4);
    expect(v.reasons.join(" ")).toMatch(/free land/i);
  });
});

// ---------- unknown ceilings ----------

describe("unknown ceilings", () => {
  it("has no ceiling without an eligible alternative, keeps the unit, and names the gap", () => {
    const v = valueProperty(inputsOf("tp-subject"), allChecks(), []);
    expect(v.verdict).toBe("maybe");
    expect(v.maxLandPricePerAcre.value).toBeNull();
    expect(v.maxLandPricePerAcre.unit).toBe("USD/acre");
    expect(v.missingInputs).toContain("maxLandPricePerAcre");
  });

  it("withholds the ceiling while a cooling design's eligibility is unknown, but not when it is ruled out", () => {
    const unknownDry = inputsOf("tp-subject", {
      cooling: { evaporative: coolingOf(1.15, 1.9, 1), dry: coolingOf(1.45, 0, 1.25, null) } });
    const vUnknown = valueProperty(unknownDry, allChecks(), [alternativeOf()]);
    expect(vUnknown.maxLandPricePerAcre.value).toBeNull();
    expect(vUnknown.verdict).toBe("maybe");

    const ruledOutDry = inputsOf("tp-subject", {
      cooling: { evaporative: coolingOf(1.15, 1.9, 1), dry: coolingOf(1.45, 0, 1.25, false) } });
    const vRuledOut = valueProperty(ruledOutDry, allChecks(), [alternativeOf()]);
    expect(vRuledOut.maxLandPricePerAcre.value).toBeCloseTo(breakEvenLandPricePerAcre(altTotalPv, subjectNonLandPv, ACRES), 6);
  });

  it("has no ceiling when the subject's non-land PV is unknown", () => {
    const v = valueProperty(
      inputsOf("tp-subject", { electricityUsdPerKwh: tag(null, "USD/kWh") }), allChecks(), [alternativeOf()]);
    expect(v.maxLandPricePerAcre.value).toBeNull();
    expect(v.verdict).toBe("maybe");
  });
});
