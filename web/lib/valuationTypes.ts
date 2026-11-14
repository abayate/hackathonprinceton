/**
 * Shared property-valuation contract for Marvin, AJ and Allen.
 * Import types from this module; import valueProperty/sampleValuation from ./valuation.
 * Units are explicit. Unknown values stay null; synthetic values remain sample.
 * This is a facility-cost comparison, not an appraisal or full ownership-cost model.
 */
export type ValueKind = "reported" | "modeled" | "assumed" | "sample";

export type Tagged = Readonly<{
  value: number | null;
  unit: string;
  kind: ValueKind;
  /** Source registry ID, source URL, or explicit assumption/sample identifier. */
  source: string;
  note?: string;
}>;

export type CoolingDesign = "evaporative" | "dry";
export type Verdict = "buy" | "maybe" | "pass";
export type ValuationCheckId = "power" | "water" | "zoning" | "opposition" | "policy" | "land" | "labor";
export type ValuationCheck = Readonly<{
  id: ValuationCheckId;
  status: "pass" | "watch" | "fail" | "unknown";
  detail: string;
}>;

export type CoolingInputs = Readonly<{
  /** Confirmed feasibility for this site/workload; null means not established. */
  eligible: boolean | null;
  pue: Tagged; // kWh/kWh, >= 1
  wueLPerItKwh: Tagged; // L/kWh, site water per IT electricity
  buildMultiplier: Tagged; // ratio, > 0
}>;

/** No market defaults: the caller supplies evidence or an explicit assumption. */
export type ValuationInputs = Readonly<{
  siteId: string;
  mw: Tagged; // MW, rated IT power
  acres: Tagged; // acre
  askingPriceTotal: Tagged; // USD, total acquisition price, not USD/acre
  buildCostUsdPerW: Tagged; // USD/W, per IT watt, excludes land/utility works
  utilityConnectUsd: Tagged; // USD, separately itemized initial connection cost
  electricityUsdPerKwh: Tagged; // USD/kWh
  waterUsdPerM3: Tagged; // USD/m3
  maintenanceRate: Tagged; // ratio, annual fraction of adjusted build cost only
  avgLoad: Tagged; // ratio, average electrical load in (0,1], not CPU utilization
  cooling: Readonly<Record<CoolingDesign, CoolingInputs>>;
}>;

/** Full alternative inputs prevent comparing unrelated workloads or failed sites. */
export type Alternative = Readonly<{
  inputs: ValuationInputs;
  checks: readonly ValuationCheck[];
}>;

export type CostBreakdown = Readonly<{
  land: Tagged;
  build: Tagged;
  utility: Tagged;
  annualItKwh: Tagged;
  annualFacilityKwh: Tagged;
  annualWaterM3: Tagged;
  annualPower: Tagged;
  annualWater: Tagged;
  annualMaintenance: Tagged;
  powerPv: Tagged;
  waterPv: Tagged;
  maintenancePv: Tagged;
  nonLandPv: Tagged;
  totalPv: Tagged;
  missingInputs: readonly string[];
}>;

export type ElectricitySensitivity = Readonly<{
  electricityMultiplier: Tagged;
  electricityUsdPerKwh: Tagged;
  totalPv: Tagged;
  totalPvDelta: Tagged;
  maxLandPricePerAcre: Tagged;
  verdict: Verdict;
}>;

export type PropertyValuation = Readonly<{
  siteId: string;
  mw: Tagged;
  acres: Tagged;
  analysisYears: Tagged;
  discountRate: Tagged;
  verdict: Verdict;
  reasons: readonly string[];
  missingInputs: readonly string[];
  askingPricePerAcre: Tagged;
  /** Negative means even free land cannot match the eligible alternative. */
  maxLandPricePerAcre: Tagged;
  tenYearCost: Tagged;
  nextBestSiteId: string | null;
  nextBestTenYearCost: Tagged;
  recommendedCooling: CoolingDesign | null;
  cooling: Readonly<Record<CoolingDesign, CostBreakdown>>;
  sampleTainted: boolean;
  sensitivities: Readonly<{
    /** Subject electricity changes; original selected cooling and alternative stay fixed. */
    scope: "subject-electricity-only-fixed-cooling-and-alternative";
    electricity: readonly ElectricitySensitivity[];
    /** Evaporative total PV minus dry total PV; compare feasibility separately. */
    coolingDeltaPv: Tagged;
  }>;
}>;
