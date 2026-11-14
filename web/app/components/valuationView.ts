// Display helpers for Marvin's PropertyValuation (web/lib/valuationTypes.ts). Client-safe: types only.

import type { CoolingDesign, CostBreakdown, PropertyValuation, Tagged, Verdict } from "@/lib/valuationTypes";

export type Priority = "recommended" | "lowest_cost" | "verdict";

export const READY_BY_YEARS = [2027, 2028, 2029, 2030, 2031, 2032] as const;
export const DEFAULT_READY_BY = 2029;

export function parseReadyBy(raw: unknown): number {
  const value = Number(raw);
  return (READY_BY_YEARS as readonly number[]).includes(value) ? value : DEFAULT_READY_BY;
}

export function parsePriority(raw: unknown): Priority {
  return raw === "lowest_cost" || raw === "verdict" ? raw : "recommended";
}

export const VERDICT_STYLE: Record<Verdict, { label: string; color: string; cls: string }> = {
  buy: { label: "Buy", color: "#047857", cls: "bg-emerald-700" },
  maybe: { label: "Maybe", color: "#b45309", cls: "bg-amber-700" },
  pass: { label: "Pass", color: "#be123c", cls: "bg-rose-700" },
};

export const COOLING_LABEL: Record<CoolingDesign, string> = { evaporative: "Water-cooled", dry: "Dry-cooled" };

export const usd = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const perAcre = (value: number | null) => value == null ? null : `${usd(value)}/acre`;

const SCOPE_PREFIX = "Ten-year facility-cost scenario excludes";
const MISSING_PREFIX = "Missing or invalid inputs:";
const SAMPLE_PREFIX = "Sample scenario only";

const MISSING_LABELS: Record<string, string> = {
  mw: "Workload (MW)",
  acres: "Parcel acreage",
  askingPriceTotal: "Asking price",
  askingPricePerAcre: "Asking price or acreage",
  buildCostUsdPerW: "Build cost per watt",
  utilityConnectUsd: "Utility connection cost",
  electricityUsdPerKwh: "Electricity price",
  waterUsdPerM3: "Water price",
  maintenanceRate: "Maintenance rate",
  avgLoad: "Average load",
  eligibleAlternative: "A comparison site that passes every check",
  eligibleCoolingDesign: "A confirmed cooling design",
  siteId: "Property ID",
};

/** Human-readable missing inputs; engine-internal keys are translated or dropped. */
export function missingLabels(v: PropertyValuation): string[] {
  const out = v.missingInputs.flatMap((key) => {
    if (key === "maxLandPricePerAcre" || key.startsWith("cost.")) return [];
    if (key.startsWith("checks.")) return [`${capitalize(key.slice(7))} check`];
    if (key.startsWith("cooling.")) return [`Cooling: ${key.split(".").slice(1).join(" ")}`];
    return [MISSING_LABELS[key] ?? key];
  });
  return [...new Set(out)];
}

/** Reasons worth showing on their own; scope and missing-input lines are shown elsewhere. */
export function displayReasons(v: PropertyValuation): string[] {
  return v.reasons.filter((r) => !r.startsWith(SCOPE_PREFIX) && !r.startsWith(MISSING_PREFIX) && !r.startsWith(SAMPLE_PREFIX));
}

export function scopeNote(v: PropertyValuation): string | null {
  return v.reasons.find((r) => r.startsWith(SCOPE_PREFIX)) ?? null;
}

/** One-line headline for the verdict. */
export function headline(v: PropertyValuation): string {
  const max = v.maxLandPricePerAcre.value;
  const failed = displayReasons(v).find((r) => /^(power|water|zoning|opposition|policy|land|labor):/.test(r));
  if (v.verdict === "buy" && max != null) return `Worth buying up to ${usd(max)} per acre.`;
  if (v.verdict === "pass") {
    if (failed) return `Pass: the ${failed.split(":")[0]} check failed.`;
    if (max != null && max < 0) return "Even free land can't beat the comparison site.";
    if (max != null) return `Priced above its ceiling of ${usd(max)} per acre.`;
    return "Not worth pursuing at this workload.";
  }
  return max != null && max >= 0
    ? `Up to ${usd(max)} per acre, once the open questions are answered.`
    : "Not enough information for a price ceiling yet.";
}

/** Short reason for a card. */
export function cardReason(v: PropertyValuation): string {
  const reasons = displayReasons(v);
  const first = reasons.find((r) => !r.startsWith("Watch")) ?? reasons[0];
  if (first) return first;
  const missing = missingLabels(v);
  return missing.length ? `Open: ${missing.slice(0, 2).join(", ")}${missing.length > 2 ? ` +${missing.length - 2} more` : ""}.` : "";
}

export function maxPurchasePrice(v: PropertyValuation): Tagged {
  const max = v.maxLandPricePerAcre.value;
  const acres = v.acres.value;
  return { ...v.maxLandPricePerAcre, value: max != null && acres != null ? Math.max(0, max) * acres : null, unit: "USD", note: "Price ceiling × recorded acreage" };
}

export function selectedBreakdown(v: PropertyValuation, design?: CoolingDesign): CostBreakdown {
  return v.cooling[design ?? v.recommendedCooling ?? "evaporative"];
}

export function isSample(v: PropertyValuation): boolean {
  return v.sampleTainted;
}

const VERDICT_ORDER: Record<Verdict, number> = { buy: 0, maybe: 1, pass: 2 };

export function sortByPriority<T extends { valuation: PropertyValuation }>(items: T[], priority: Priority): T[] {
  if (priority === "recommended") return items;
  const cost = (item: T) => item.valuation.tenYearCost.value ?? Infinity;
  return [...items].sort((a, b) => priority === "lowest_cost"
    ? cost(a) - cost(b)
    : VERDICT_ORDER[a.valuation.verdict] - VERDICT_ORDER[b.valuation.verdict] || cost(a) - cost(b));
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
