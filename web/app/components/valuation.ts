// Frontend-side valuation contract and SAMPLE stub.
//
// The real engine is Marvin's (web/lib/valuation.ts + web/lib/valuationTypes.ts). Until it lands,
// the UI builds against this shape. When Marvin's types are frozen, replace the types below with
// `export type { ... } from "@/lib/valuationTypes"` and swap `sampleValuation` for the real call.
//
// Every number produced here that is not a recorded CoStar fact or an existing sourced constant
// is tagged `sample`, and `is_sample` is true, so the UI must label it as sample output.

import { CONSTANTS, type Band } from "@/lib/model";

export type NumKind = "reported" | "modeled" | "assumed" | "sample";
export type Num = { value: number | null; unit: string; kind: NumKind; source_id: string | null; note?: string };
export type Verdict = "buy" | "maybe" | "pass";
export type Priority = "recommended" | "lowest_cost" | "verdict";
export type CoolingId = "evaporative" | "dry";

export type ValuationRequest = { it_power_mw: number; ready_by_year: number };

export type CostLine = { id: "land" | "build" | "power" | "maintenance"; label: string; amount: Num };

export type CoolingDesign = {
  design_id: CoolingId;
  label: string;
  pue: Num;
  annual_energy_mwh: Num;
  annual_water_gallons: Num;
  cost_lines: CostLine[];
  ten_year_cost_usd: Num;
};

export type PropertyValuation = {
  site_id: string;
  verdict: Verdict;
  sentence: string;
  reasons: string[];
  max_price_usd_per_acre: Num;
  max_price_usd: Num;
  asking_price_usd_per_acre: Num;
  /** Ten-year cost for the recommended design. */
  ten_year_cost_usd: Num;
  recommended_design: CoolingId;
  designs: CoolingDesign[];
  missing_inputs: string[];
  required_acres: Num;
  is_sample: boolean;
};

export type ValuationInput = {
  site_id: string;
  state: string;
  lot_acres: number | null;
  asking_price: number | null;
  band: Band | null;
};

export const READY_BY_YEARS = [2027, 2028, 2029, 2030, 2031, 2032] as const;
export const DEFAULT_READY_BY = 2029;

export function parseReadyBy(raw: unknown): number {
  const value = Number(raw);
  return (READY_BY_YEARS as readonly number[]).includes(value) ? value : DEFAULT_READY_BY;
}

export function parsePriority(raw: unknown): Priority {
  return raw === "lowest_cost" || raw === "verdict" ? raw : "recommended";
}

const num = (value: number | null, unit: string, kind: NumKind, source_id: string | null = null, note?: string): Num => ({ value, unit, kind, source_id, ...(note ? { note } : {}) });
const positive = (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 0 ? value : null;

// --- Sample-only constants. None of these are sourced; replace with Marvin/Noah's inputs. ---
const SAMPLE = {
  maxPricePerAcre: { houston: 400_000, la: 3_000_000 },
  electricityUsdPerKwhLa: 0.18,
  acresPerMw: 0.3,
  maintenanceShareOfBuild: 0.02,
  discountRate: 0.08,
  years: 10,
  designs: {
    evaporative: { label: "Water-cooled", pue: 1.2, litersPerKwh: 1.8, buildMultiplier: 1 },
    dry: { label: "Dry-cooled", pue: 1.35, litersPerKwh: 0.2, buildMultiplier: 1.03 },
  },
};
const LITERS_PER_GALLON = 3.785411784;

function annuityFactor(rate: number, years: number) {
  let total = 0;
  for (let t = 1; t <= years; t += 1) total += 1 / (1 + rate) ** t;
  return total;
}

const usd = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** SAMPLE valuation so the UI can be built before the real engine exists. Not an investment output. */
export function sampleValuation(input: ValuationInput, request: ValuationRequest): PropertyValuation {
  const market = input.state === "CA" ? "la" : "houston";
  const mw = request.it_power_mw;
  const acres = positive(input.lot_acres);
  const asking = positive(input.asking_price);
  const askingPerAcre = asking != null && acres != null ? asking / acres : null;
  const maxPerAcre = SAMPLE.maxPricePerAcre[market];
  const requiredAcres = mw * SAMPLE.acresPerMw;
  const electricity = market === "la"
    ? num(SAMPLE.electricityUsdPerKwhLa, "USD/kWh", "sample", null, "Sample LA rate; no sourced California tariff yet")
    : num(CONSTANTS.electricityUsdPerKwh.value, "USD/kWh", "reported", CONSTANTS.electricityUsdPerKwh.source, CONSTANTS.electricityUsdPerKwh.note);
  const factor = annuityFactor(SAMPLE.discountRate, SAMPLE.years);
  const itKwhPerYear = mw * 1000 * CONSTANTS.avgLoad.value * 8760;

  const designs: CoolingDesign[] = (["evaporative", "dry"] as const).map((id) => {
    const d = SAMPLE.designs[id];
    const facilityKwh = itKwhPerYear * d.pue;
    const build = mw * 1e6 * CONSTANTS.buildCostUsdPerW.value * d.buildMultiplier;
    const power = facilityKwh * (electricity.value ?? 0) * factor;
    const maintenance = build * SAMPLE.maintenanceShareOfBuild * factor;
    const lines: CostLine[] = [
      { id: "land", label: "Land (asking price)", amount: num(asking, "USD", "reported", "costar", "CoStar asking price snapshot") },
      { id: "build", label: "Build", amount: num(build, "USD", "modeled", CONSTANTS.buildCostUsdPerW.source, `${CONSTANTS.buildCostUsdPerW.note}${d.buildMultiplier !== 1 ? `; ×${d.buildMultiplier} sample dry-cooling premium` : ""}`) },
      { id: "power", label: "Power, 10 years", amount: num(power, "USD", electricity.kind === "sample" ? "sample" : "modeled", electricity.source_id, `PUE ${d.pue} (sample), ${CONSTANTS.avgLoad.value * 100}% load, ${electricity.value} USD/kWh, discounted at ${SAMPLE.discountRate * 100}%`) },
      { id: "maintenance", label: "Maintenance, 10 years", amount: num(maintenance, "USD", "sample", null, `${SAMPLE.maintenanceShareOfBuild * 100}% of build per year (sample), discounted`) },
    ];
    const total = asking == null ? null : lines.reduce((sum, line) => sum + (line.amount.value ?? 0), 0);
    return {
      design_id: id,
      label: d.label,
      pue: num(d.pue, "ratio", "sample"),
      annual_energy_mwh: num(facilityKwh / 1000, "MWh/yr", "sample"),
      annual_water_gallons: num((itKwhPerYear * d.litersPerKwh) / LITERS_PER_GALLON, "gal/yr", "sample", null, `${d.litersPerKwh} L/kWh (sample)`),
      cost_lines: lines,
      ten_year_cost_usd: num(total, "USD", "sample", null, asking == null ? "Unknown without a recorded asking price" : "Sum of the lines above"),
    };
  });
  const recommended = designs.reduce((best, d) => (d.ten_year_cost_usd.value ?? Infinity) < (best.ten_year_cost_usd.value ?? Infinity) ? d : best, designs[0]);

  const reasons: string[] = [];
  const missing: string[] = [];
  if (asking == null) missing.push("Asking price");
  if (acres == null) missing.push("Parcel acreage");
  missing.push(`Utility capacity and a connection date before ${request.ready_by_year}`, "Flood exposure and terrain");

  let verdict: Verdict;
  if (acres != null && acres < requiredAcres) {
    verdict = "pass";
    reasons.push(`${acres.toLocaleString("en-US", { maximumFractionDigits: 1 })} acres; about ${requiredAcres.toLocaleString("en-US", { maximumFractionDigits: 1 })} needed for ${mw} MW.`);
  } else if (askingPerAcre == null) {
    verdict = "maybe";
    reasons.push("Price per acre can't be compared with the ceiling until the asking price and acreage are known.");
  } else if (askingPerAcre > maxPerAcre) {
    verdict = "pass";
    reasons.push(`Asking ${usd(askingPerAcre)} per acre is above the ${usd(maxPerAcre)} ceiling.`);
  } else if (askingPerAcre <= maxPerAcre * 0.85) {
    verdict = "buy";
    reasons.push(`Asking ${usd(askingPerAcre)} per acre leaves room under the ${usd(maxPerAcre)} ceiling.`);
  } else {
    verdict = "maybe";
    reasons.push(`Asking ${usd(askingPerAcre)} per acre is close to the ${usd(maxPerAcre)} ceiling.`);
  }
  if (verdict === "buy" && input.band === "red") {
    verdict = "maybe";
    reasons.push("The area's Texas screening band is High risk.");
  }

  const sentence = verdict === "pass" && acres != null && acres < requiredAcres
    ? "Too small for this workload."
    : verdict === "pass"
      ? `Priced above what it's worth: the ceiling is ${usd(maxPerAcre)} per acre.`
      : `Worth buying up to ${usd(maxPerAcre)} per acre${verdict === "maybe" ? ", once the open questions are answered" : ""}.`;

  return {
    site_id: input.site_id,
    verdict,
    sentence,
    reasons,
    max_price_usd_per_acre: num(maxPerAcre, "USD/acre", "sample", null, "Sample ceiling per market; the real ceiling comes from the ten-year comparison"),
    max_price_usd: num(acres == null ? null : maxPerAcre * acres, "USD", "sample"),
    asking_price_usd_per_acre: num(askingPerAcre, "USD/acre", askingPerAcre == null ? "reported" : "modeled", "costar", "Recorded asking price ÷ recorded acreage"),
    ten_year_cost_usd: recommended.ten_year_cost_usd,
    recommended_design: recommended.design_id,
    designs,
    missing_inputs: missing,
    required_acres: num(requiredAcres, "acres", "sample", null, `${SAMPLE.acresPerMw} acres per MW (sample)`),
    is_sample: true,
  };
}

export const VERDICT_STYLE: Record<Verdict, { label: string; color: string; cls: string }> = {
  buy: { label: "Buy", color: "#047857", cls: "bg-emerald-700" },
  maybe: { label: "Maybe", color: "#b45309", cls: "bg-amber-700" },
  pass: { label: "Pass", color: "#be123c", cls: "bg-rose-700" },
};

const VERDICT_ORDER: Record<Verdict, number> = { buy: 0, maybe: 1, pass: 2 };

export function sortByPriority<T extends { valuation: PropertyValuation }>(items: T[], priority: Priority): T[] {
  if (priority === "recommended") return items;
  const cost = (item: T) => item.valuation.ten_year_cost_usd.value ?? Infinity;
  return [...items].sort((a, b) => priority === "lowest_cost"
    ? cost(a) - cost(b)
    : VERDICT_ORDER[a.valuation.verdict] - VERDICT_ORDER[b.valuation.verdict] || cost(a) - cost(b));
}
