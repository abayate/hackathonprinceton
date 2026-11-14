import type { BandOutcomes } from "./modelCard";

// Every constant here is tagged with where it comes from. IDs match data/sources.csv.

export type Kind = "reported" | "modeled" | "assumed";

export const CONSTANTS = {
  buildCostUsdPerW: { value: 10.51, kind: "reported" as Kind, source: "S02", note: "Turner & Townsend 2026-27, Dallas benchmark (~60 MW air-cooled; excludes land, utility works, IT equipment, fees)" },
  electricityUsdPerKwh: { value: 0.0721, kind: "reported" as Kind, source: "S01", note: "EIA, Texas industrial average, Aug 2026 (preliminary)" },
  leaseUsdPerKwMonth: { value: 170, kind: "reported" as Kind, source: "brief", note: "CBRE North America 10 MW+ lease range $160–185/kW/month (midpoint)" },
  typicalDelayMonths: { value: 12, kind: "assumed" as Kind, source: "assumption", note: "Team assumption for a blocked-or-delayed project; replace with a sourced figure" },
  pue: { value: 1.2, kind: "assumed" as Kind, source: "S19", note: "Scenario assumption; PUE definition from LBNL 2024" },
  avgLoad: { value: 0.7, kind: "assumed" as Kind, source: "assumption", note: "Average electrical load, scenario assumption" },
};

// Risk bands on the model's p(stopped). Thresholds are our choice, not learned.
export const BANDS = { watch: 0.4, red: 0.6 };
export type Band = "green" | "watch" | "red";

export const BAND_COLOR: Record<Band | "none", string> = {
  green: "#059669",
  watch: "#d97706",
  red: "#e11d48",
  none: "#64748b",
};

export function band(p: number | null): Band | null {
  if (p == null) return null;
  if (p >= BANDS.red) return "red";
  if (p >= BANDS.watch) return "watch";
  return "green";
}

/** Round down so a displayed score never crosses its unchanged risk-band threshold. */
export function displayScore(score: number | null | undefined): number | null {
  return score == null || !Number.isFinite(score) || score < 0 || score > 1 ? null : Math.floor(score * 100);
}

export function stoppedShareForBand(riskBand: Band | null, outcomes: BandOutcomes): number | null {
  return riskBand === null ? null : outcomes.bands[riskBand].rate;
}

export function economics(stoppedShare: number | null, mw: number) {
  const kw = mw * 1000;
  const monthlyLease = kw * CONSTANTS.leaseUsdPerKwMonth.value;
  const buildCost = mw * 1e6 * CONSTANTS.buildCostUsdPerW.value;
  const annualPower =
    kw * CONSTANTS.pue.value * CONSTANTS.avgLoad.value * 8760 * CONSTANTS.electricityUsdPerKwh.value;
  const expectedDelayMonths = stoppedShare == null ? null : stoppedShare * CONSTANTS.typicalDelayMonths.value;
  const expectedDelayCost = expectedDelayMonths == null ? null : expectedDelayMonths * monthlyLease;
  return { buildCost, annualPower, monthlyLease, expectedDelayMonths, expectedDelayCost };
}

export function money(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "Unknown";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

/** Numeric kernel for the tagged property valuation API. All costs are USD. */
export type TenYearCostInputs = Readonly<{
  /** Rated IT power, not total facility demand. */
  mw: number;
  /** Average IT electrical loading fraction, not CPU utilization. */
  avgLoad: number;
  landUsd: number;
  buildCostUsdPerW: number;
  buildMultiplier: number;
  utilityConnectUsd: number;
  electricityUsdPerKwh: number;
  waterUsdPerM3: number;
  pue: number;
  wueLPerItKwh: number;
  maintenanceRate: number;
}>;

export type TenYearCosts = Readonly<{
  land: number; build: number; utility: number;
  annualItKwh: number; annualFacilityKwh: number; annualWaterM3: number;
  annualPower: number; annualWater: number; annualMaintenance: number;
  powerPv: number; waterPv: number; maintenancePv: number;
  nonLandPv: number; totalPv: number;
}>;

// Policy assumptions from Marvin's assignment, not a prescribed NIST rate/lifetime.
export const VALUATION_POLICY = Object.freeze({ years: 10, discountRate: 0.08 });
// Unit conversions, not empirical performance assumptions.
const HOURS_PER_YEAR = 8760;
const WATTS_PER_MW = 1_000_000;
const KW_PER_MW = 1000;
const LITERS_PER_M3 = 1000;

function requireRange(name: string, value: number, min = 0, max = Infinity, exclusiveMin = false): void {
  if (!Number.isFinite(value) || value > max || (exclusiveMin ? value <= min : value < min)) {
    throw new RangeError(`${name} is outside its finite permitted range`);
  }
}

function finiteResult(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Cost calculation exceeds the supported numeric range");
  return value;
}

/**
 * End-of-year uniform payments, discounted to year zero (NIST HB 135, S20).
 * https://doi.org/10.6028/NIST.HB.135e2025
 * Fixed-dollar costs and a matching discount rate; no escalation is implied.
 * Summing periods avoids cancellation in the annuity formula near a zero rate.
 */
export function presentValueAnnualCost(annualCost: number, years: number = VALUATION_POLICY.years, discountRate: number = VALUATION_POLICY.discountRate): number {
  requireRange("annualCost", annualCost);
  requireRange("years", years, 1, 100);
  requireRange("discountRate", discountRate);
  if (!Number.isInteger(years)) throw new RangeError("years must be an integer");
  const factor = Array.from({ length: years }, (_, index) => (1 + discountRate) ** -(index + 1))
    .reduce((sum, discount) => sum + discount, 0);
  return finiteResult(annualCost * factor);
}

function validateCostInputs(input: TenYearCostInputs): void {
  Object.entries(input).forEach(([name, value]) => requireRange(name, value));
  requireRange("mw", input.mw, 0, Infinity, true);
  requireRange("avgLoad", input.avgLoad, 0, 1, true);
  requireRange("pue", input.pue, 1);
  requireRange("buildMultiplier", input.buildMultiplier, 0, Infinity, true);
  requireRange("maintenanceRate", input.maintenanceRate, 0, 1);
}

/**
 * Ten-year facility-cost scenario: capex at year zero, constant annual opex.
 * PUE multiplies IT energy; WUE uses IT kWh, NOT facility kWh (LBNL, S19).
 * Construction USD/W is per IT watt, with land and utility works separate (S03).
 * Maintenance is an explicit fraction of adjusted building capex only; excluding
 * utility maintenance is a scope assumption, not a claim about its actual cost.
 * Excludes IT equipment, fees, abnormal/site works, tax, financing, replacements,
 * residual land/building value, escalation and delay exposure. Not full TCO.
 */
export function calculateTenYearCosts(input: TenYearCostInputs): TenYearCosts {
  validateCostInputs(input);
  const build = input.mw * WATTS_PER_MW * input.buildCostUsdPerW * input.buildMultiplier;
  const annualItKwh = input.mw * KW_PER_MW * HOURS_PER_YEAR * input.avgLoad;
  const annualFacilityKwh = annualItKwh * input.pue;
  const annualWaterM3 = annualItKwh * input.wueLPerItKwh / LITERS_PER_M3;
  const annualPower = annualFacilityKwh * input.electricityUsdPerKwh;
  const annualWater = annualWaterM3 * input.waterUsdPerM3;
  const annualMaintenance = build * input.maintenanceRate;
  const powerPv = presentValueAnnualCost(annualPower);
  const waterPv = presentValueAnnualCost(annualWater);
  const maintenancePv = presentValueAnnualCost(annualMaintenance);
  const nonLandPv = build + input.utilityConnectUsd + powerPv + waterPv + maintenancePv;
  const result: TenYearCosts = {
    land: input.landUsd, build, utility: input.utilityConnectUsd,
    annualItKwh, annualFacilityKwh, annualWaterM3,
    annualPower, annualWater, annualMaintenance, powerPv, waterPv, maintenancePv,
    nonLandPv, totalPv: nonLandPv + input.landUsd,
  };
  Object.values(result).forEach(finiteResult);
  return result;
}

/** A negative answer means the subject cannot match the alternative even with free land. */
export function breakEvenLandPricePerAcre(alternativeAllInPv: number, subjectNonLandPv: number, acres: number): number {
  requireRange("alternativeAllInPv", alternativeAllInPv);
  requireRange("subjectNonLandPv", subjectNonLandPv);
  requireRange("acres", acres, 0, Infinity, true);
  return finiteResult((alternativeAllInPv - subjectNonLandPv) / acres);
}
