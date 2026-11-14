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

export function economics(pStopped: number | null, mw: number) {
  const kw = mw * 1000;
  const monthlyLease = kw * CONSTANTS.leaseUsdPerKwMonth.value;
  const buildCost = mw * 1e6 * CONSTANTS.buildCostUsdPerW.value;
  const annualPower =
    kw * CONSTANTS.pue.value * CONSTANTS.avgLoad.value * 8760 * CONSTANTS.electricityUsdPerKwh.value;
  const expectedDelayMonths = pStopped == null ? null : pStopped * CONSTANTS.typicalDelayMonths.value;
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
