import { breakEvenLandPricePerAcre, calculateTenYearCosts, presentValueAnnualCost, VALUATION_POLICY } from "./model";
import type { Alternative, CoolingDesign, CostBreakdown, ElectricitySensitivity, PropertyValuation, Tagged, ValuationCheck, ValuationInputs, ValueKind, Verdict } from "./valuationTypes";

const DESIGNS: readonly CoolingDesign[] = ["evaporative", "dry"];
const CHECK_IDS = ["power", "water", "zoning", "opposition", "policy", "land", "labor"] as const;
const KINDS: readonly ValueKind[] = ["reported", "modeled", "assumed", "sample"];
const unique = (items: readonly string[]): string[] => [...new Set(items)];

function number(value: number | null, unit: string, kind: ValueKind = "assumed", source = "assumption", note?: string): Tagged {
  return { value, unit, kind, source, ...(note ? { note } : {}) };
}

/** Validate values AND units at the boundary; invalid data is explicitly unknown. */
function clean(tag: Tagged | undefined, unit: string, min = 0, max = Infinity, positive = false): Tagged {
  const metadataValid = tag && KINDS.includes(tag.kind) && tag.unit === unit
    && typeof tag.source === "string" && tag.source.trim().length > 0;
  const valid = metadataValid && typeof tag.value === "number" && Number.isFinite(tag.value)
    && tag.value <= max && (positive ? tag.value > min : tag.value >= min);
  return number(valid ? tag.value : null, unit, metadataValid ? tag.kind : "assumed",
    metadataValid ? tag.source : "missing", typeof tag?.note === "string" ? tag.note : undefined);
}

function normalize(input: ValuationInputs): ValuationInputs {
  const design = (id: CoolingDesign) => ({
    eligible: typeof input.cooling?.[id]?.eligible === "boolean" ? input.cooling[id].eligible : null,
    pue: clean(input.cooling?.[id]?.pue, "kWh/kWh", 1),
    wueLPerItKwh: clean(input.cooling?.[id]?.wueLPerItKwh, "L/kWh"),
    buildMultiplier: clean(input.cooling?.[id]?.buildMultiplier, "ratio", 0, Infinity, true),
  });
  return {
    siteId: typeof input.siteId === "string" ? input.siteId.trim() : "",
    mw: clean(input.mw, "MW", 0, Infinity, true), acres: clean(input.acres, "acre", 0, Infinity, true),
    askingPriceTotal: clean(input.askingPriceTotal, "USD"), buildCostUsdPerW: clean(input.buildCostUsdPerW, "USD/W"),
    utilityConnectUsd: clean(input.utilityConnectUsd, "USD"), electricityUsdPerKwh: clean(input.electricityUsdPerKwh, "USD/kWh"),
    waterUsdPerM3: clean(input.waterUsdPerM3, "USD/m3"), maintenanceRate: clean(input.maintenanceRate, "ratio", 0, 1),
    avgLoad: clean(input.avgLoad, "ratio", 0, 1, true),
    cooling: { evaporative: design("evaporative"), dry: design("dry") },
  };
}

function derived(unit: string, dependencies: readonly Tagged[], fn: (...values: number[]) => number, note?: string): Tagged {
  const kind: ValueKind = dependencies.some(x => x.kind === "sample") ? "sample"
    : dependencies.some(x => x.kind === "assumed") ? "assumed" : "modeled";
  const source = unique(dependencies.map(x => x.source)).join("; ") || "model";
  if (dependencies.some(x => x.value === null)) return number(null, unit, kind, source, note);
  try {
    const result = fn(...dependencies.map(x => x.value!));
    return number(Number.isFinite(result) ? result : null, unit, kind, source, note);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return number(null, unit, kind, source, note);
  }
}

const discount = number(VALUATION_POLICY.discountRate, "ratio", "assumed", "assignment:discount-rate", "Team scenario; not a NIST-prescribed rate.");
const years = number(VALUATION_POLICY.years, "year", "assumed", "assignment:analysis-period");
const pv = (annual: Tagged): Tagged => derived("USD", [annual, years, discount], presentValueAnnualCost);
const sum = (values: readonly Tagged[]): Tagged => derived("USD", values, (...xs) => xs.reduce((a, b) => a + b, 0));

function partialCosts(input: ValuationInputs, design: CoolingDesign): Omit<CostBreakdown, "missingInputs"> {
  const cooling = input.cooling[design];
  const build = derived("USD", [input.mw, input.buildCostUsdPerW, cooling.buildMultiplier], (mw, cost, multiplier) => mw * 1e6 * cost * multiplier);
  const annualItKwh = derived("kWh/year", [input.mw, input.avgLoad], (mw, load) => mw * 1000 * 8760 * load);
  const annualFacilityKwh = derived("kWh/year", [annualItKwh, cooling.pue], (energy, pue) => energy * pue);
  const annualWaterM3 = derived("m3/year", [annualItKwh, cooling.wueLPerItKwh], (energy, wue) => energy * wue / 1000);
  const annualPower = derived("USD/year", [annualFacilityKwh, input.electricityUsdPerKwh], (energy, price) => energy * price);
  const annualWater = derived("USD/year", [annualWaterM3, input.waterUsdPerM3], (water, price) => water * price);
  const annualMaintenance = derived("USD/year", [build, input.maintenanceRate], (cost, rate) => cost * rate);
  const powerPv = pv(annualPower), waterPv = pv(annualWater), maintenancePv = pv(annualMaintenance);
  const nonLandPv = sum([build, input.utilityConnectUsd, powerPv, waterPv, maintenancePv]);
  return { land: input.askingPriceTotal, build, utility: input.utilityConnectUsd,
    annualItKwh, annualFacilityKwh, annualWaterM3, annualPower, annualWater, annualMaintenance,
    powerPv, waterPv, maintenancePv, nonLandPv, totalPv: sum([input.askingPriceTotal, nonLandPv]) };
}

/** Complete scenarios run through the same numeric kernel as model.ts's worked examples. */
function completeCosts(input: ValuationInputs, design: CoolingDesign, partial: Omit<CostBreakdown, "missingInputs">): Omit<CostBreakdown, "missingInputs"> {
  if (Object.values(partial).some(tag => tag.value === null)) return partial;
  const cooling = input.cooling[design];
  const raw = calculateTenYearCosts({ mw: input.mw.value!, avgLoad: input.avgLoad.value!,
    landUsd: input.askingPriceTotal.value!, buildCostUsdPerW: input.buildCostUsdPerW.value!,
    buildMultiplier: cooling.buildMultiplier.value!, utilityConnectUsd: input.utilityConnectUsd.value!,
    electricityUsdPerKwh: input.electricityUsdPerKwh.value!, waterUsdPerM3: input.waterUsdPerM3.value!,
    pue: cooling.pue.value!, wueLPerItKwh: cooling.wueLPerItKwh.value!, maintenanceRate: input.maintenanceRate.value! });
  return Object.fromEntries(Object.entries(partial).map(([key, tag]) => [key,
    { ...tag, value: raw[key as keyof typeof raw] }])) as Omit<CostBreakdown, "missingInputs">;
}

function numericMissing(input: ValuationInputs, design: CoolingDesign): string[] {
  const scalar = Object.entries(input).filter(([key, value]) => key !== "cooling" && key !== "siteId"
    && (value as Tagged).value === null).map(([key]) => key);
  const cooling = Object.entries(input.cooling[design]).filter(([key, value]) => key !== "eligible"
    && (value as Tagged).value === null).map(([key]) => `cooling.${design}.${key}`);
  return [...scalar, ...cooling];
}

/** Pure costs only: feasibility is assessed by valueProperty, not by this breakdown. */
export function tenYearPv(inputs: ValuationInputs, design: CoolingDesign): CostBreakdown {
  const input = normalize(inputs);
  const costs = completeCosts(input, design, partialCosts(input, design));
  const missing = numericMissing(input, design);
  const calculationMissing = Object.entries(costs).filter(([, tag]) => tag.value === null).map(([key]) => `cost.${design}.${key}`);
  return { ...costs, missingInputs: unique([...missing, ...calculationMissing]) };
}

type CheckResult = { failed: string[]; missing: string[]; warnings: string[] };
function assessChecks(checks: readonly ValuationCheck[]): CheckResult {
  const rows = CHECK_IDS.map(id => {
    const matches = checks.filter(check => check?.id === id);
    const failed = matches.filter(check => check.status === "fail").map(check => `${id}: ${check.detail}`);
    const known = matches.length === 1 && ["pass", "watch", "fail"].includes(matches[0].status);
    return { failed, missing: known ? [] : [`checks.${id}`],
      warnings: matches.filter(check => check.status === "watch").map(check => `Watch — ${id}: ${check.detail}`) };
  });
  return { failed: rows.flatMap(row => row.failed), missing: rows.flatMap(row => row.missing), warnings: rows.flatMap(row => row.warnings) };
}

type Assessment = {
  input: ValuationInputs; cooling: Readonly<Record<CoolingDesign, CostBreakdown>>;
  selected: CoolingDesign | null; missing: string[]; checks: CheckResult; sample: boolean;
};
function hasSample(input: ValuationInputs): boolean {
  const scalar = Object.entries(input).filter(([key]) => key !== "siteId" && key !== "cooling").map(([, tag]) => tag as Tagged);
  return [...scalar, ...DESIGNS.flatMap(design => [input.cooling[design].pue, input.cooling[design].wueLPerItKwh, input.cooling[design].buildMultiplier])]
    .some(tag => tag.kind === "sample");
}

function assess(inputs: ValuationInputs, checks: readonly ValuationCheck[]): Assessment {
  const input = normalize(inputs);
  const cooling = { evaporative: tenYearPv(input, "evaporative"), dry: tenYearPv(input, "dry") };
  const known = DESIGNS.filter(design => input.cooling[design].eligible === true && cooling[design].nonLandPv.value !== null);
  const selected = known.reduce<CoolingDesign | null>((best, design) => best === null
    || cooling[design].nonLandPv.value! < cooling[best].nonLandPv.value! ? design : best, null);
  const checkResult = assessChecks(checks);
  const relevantMissing = DESIGNS.flatMap(design => input.cooling[design].eligible === false ? []
    : [...cooling[design].missingInputs, ...(input.cooling[design].eligible === null ? [`cooling.${design}.eligible`] : [])]);
  const missing = unique([...relevantMissing, ...checkResult.missing,
    ...(input.siteId ? [] : ["siteId"]), ...(selected ? [] : ["eligibleCoolingDesign"])]);
  return { input, cooling, selected, missing, checks: checkResult, sample: hasSample(input) };
}

function selectAlternative(subject: Assessment, alternatives: readonly Alternative[]): Assessment | null {
  const ids = alternatives.map(alternative => alternative.inputs.siteId?.trim());
  const candidates = alternatives.filter((alternative, index) => ids[index] && ids[index] !== subject.input.siteId
    && ids.filter(id => id === ids[index]).length === 1).map(alternative => assess(alternative.inputs, alternative.checks))
    .filter(candidate => candidate.missing.length === 0 && candidate.checks.failed.length === 0 && candidate.selected
      && candidate.input.mw.value === subject.input.mw.value && candidate.input.avgLoad.value === subject.input.avgLoad.value
      && candidate.sample === subject.sample && candidate.cooling[candidate.selected].totalPv.value !== null);
  return candidates.reduce<Assessment | null>((best, candidate) => best === null
    || candidate.cooling[candidate.selected!].totalPv.value! < best.cooling[best.selected!].totalPv.value! ? candidate : best, null);
}

function bid(acres: Tagged, nonLand: Tagged, alternative: Tagged): Tagged {
  return derived("USD/acre", [alternative, nonLand, acres], breakEvenLandPricePerAcre,
    "Relative ten-year cost equality against the eligible next-best site; not a market appraisal.");
}

/** An unpriced or unconfirmed design could be cheaper, so it cannot establish a ceiling. */
function coolingComparisonKnown(subject: Assessment): boolean {
  return DESIGNS.every(design => subject.input.cooling[design].eligible === false
    || (subject.input.cooling[design].eligible === true && subject.cooling[design].nonLandPv.value !== null));
}

function decide(asking: Tagged, maximum: Tagged, failed: boolean, missing: boolean): Verdict {
  // This epsilon covers arithmetic roundoff only; display-price rounding never controls a verdict.
  const epsilon = 1e-7;
  if (failed || (maximum.value !== null && maximum.value < 0)
    || (asking.value !== null && maximum.value !== null && asking.value > maximum.value + epsilon)) return "pass";
  return missing || asking.value === null || maximum.value === null ? "maybe" : "buy";
}

function electricitySensitivity(subject: Assessment, alternative: Tagged, asking: Tagged, multiplier: number, missing: boolean, failed: boolean): ElectricitySensitivity {
  const change = number(multiplier, "ratio", subject.sample ? "sample" : "assumed", "assumption:electricity-sensitivity");
  const electricityUsdPerKwh = derived("USD/kWh", [subject.input.electricityUsdPerKwh, change], (price, factor) => price * factor);
  const selected = subject.selected;
  const unknown = number(null, "USD", subject.sample ? "sample" : "modeled", "missing:cooling-design");
  const costs = selected ? tenYearPv({ ...subject.input, electricityUsdPerKwh }, selected) : null;
  const totalPv = costs?.totalPv ?? unknown;
  const maximum = bid(subject.input.acres, coolingComparisonKnown(subject) ? costs?.nonLandPv ?? unknown : unknown, alternative);
  return { electricityMultiplier: change, electricityUsdPerKwh, totalPv,
    totalPvDelta: derived("USD", [totalPv, selected ? subject.cooling[selected].totalPv : unknown], (next, base) => next - base),
    maxLandPricePerAcre: maximum, verdict: decide(asking, maximum, failed, missing || totalPv.value === null) };
}

/**
 * Values one property against complete, feasible, equivalent-workload alternatives.
 * Unknown checks cap a favorable result at Maybe; known failures take precedence.
 * No missing market data is replaced with sample values or regional guesses.
 */
export function valueProperty(inputs: ValuationInputs, checks: readonly ValuationCheck[], alternatives: readonly Alternative[] = []): PropertyValuation {
  const subject = assess(inputs, checks);
  const alternative = selectAlternative(subject, alternatives);
  const unknown = number(null, "USD", subject.sample ? "sample" : "modeled", "missing:comparison");
  const selected = subject.selected ? subject.cooling[subject.selected] : null;
  const alternativeCost = alternative ? alternative.cooling[alternative.selected!].totalPv : unknown;
  const maximum = bid(subject.input.acres, coolingComparisonKnown(subject) ? selected?.nonLandPv ?? unknown : unknown, alternativeCost);
  const asking = derived("USD/acre", [subject.input.askingPriceTotal, subject.input.acres], (price, acres) => price / acres);
  const noCooling = DESIGNS.every(design => subject.input.cooling[design].eligible === false);
  const failed = subject.checks.failed.length > 0 || noCooling;
  const missingInputs = unique([...subject.missing, ...(alternative ? [] : ["eligibleAlternative"]),
    ...(maximum.value === null ? ["maxLandPricePerAcre"] : []), ...(asking.value === null ? ["askingPricePerAcre"] : [])]);
  const verdict = decide(asking, maximum, failed, missingInputs.length > 0);
  const reasons = explain(subject, verdict, maximum, asking, missingInputs, noCooling, alternative?.input.siteId ?? null);
  return { siteId: subject.input.siteId, mw: subject.input.mw, acres: subject.input.acres,
    analysisYears: { ...years, kind: subject.sample ? "sample" : years.kind },
    discountRate: { ...discount, kind: subject.sample ? "sample" : discount.kind },
    verdict, reasons, missingInputs, askingPricePerAcre: asking, maxLandPricePerAcre: maximum,
    tenYearCost: selected?.totalPv ?? unknown, nextBestSiteId: alternative?.input.siteId ?? null,
    nextBestTenYearCost: alternativeCost, recommendedCooling: subject.selected, cooling: subject.cooling,
    sampleTainted: subject.sample || Boolean(alternative?.sample),
    sensitivities: { scope: "subject-electricity-only-fixed-cooling-and-alternative",
      electricity: [0.8, 1, 1.2].map(multiplier => electricitySensitivity(subject, alternativeCost, asking, multiplier, missingInputs.length > 0, failed)),
      coolingDeltaPv: derived("USD", [subject.cooling.evaporative.totalPv, subject.cooling.dry.totalPv], (wet, dry) => wet - dry) } };
}

function explain(subject: Assessment, verdict: Verdict, maximum: Tagged, asking: Tagged, missing: readonly string[], noCooling: boolean, alternative: string | null): string[] {
  return [
    ...(subject.sample ? ["Sample scenario only: synthetic data, not a verified property recommendation."] : []),
    "Ten-year facility-cost scenario excludes IT equipment, fees, abnormal/site works, financing, tax, replacements and residual value.",
    ...subject.checks.failed,
    ...(noCooling ? ["Neither cooling design is feasible for this site."] : []),
    ...(maximum.value !== null && maximum.value < 0 ? ["Even free land cannot match the next-best site's ten-year cost."] : []),
    ...(asking.value !== null && maximum.value !== null && asking.value > maximum.value + 1e-7
      ? ["The asking price exceeds the break-even maximum land price."] : []),
    ...(missing.length ? [`Missing or invalid inputs: ${missing.join(", ")}.`] : []),
    ...subject.checks.warnings,
    ...(verdict === "buy" ? [`Asking price is at or below the break-even bid against ${alternative}; all required inputs and checks are available, with no failed checks.`] : []),
  ];
}

/** Synthetic fixture for AJ/Allen: the same real engine, with every numeric output tagged sample. */
export function sampleValuation(): PropertyValuation {
  const sample = (value: number, unit: string): Tagged => number(value, unit, "sample", "sample:valuation-demo");
  const input: ValuationInputs = {
    siteId: "sample-houston", mw: sample(10, "MW"), acres: sample(20, "acre"),
    askingPriceTotal: sample(2e6, "USD"), buildCostUsdPerW: sample(11, "USD/W"),
    utilityConnectUsd: sample(3e6, "USD"), electricityUsdPerKwh: sample(0.12, "USD/kWh"),
    waterUsdPerM3: sample(2, "USD/m3"), maintenanceRate: sample(0.02, "ratio"), avgLoad: sample(1, "ratio"),
    cooling: {
      evaporative: { eligible: true, pue: sample(1.2, "kWh/kWh"), wueLPerItKwh: sample(1.8, "L/kWh"), buildMultiplier: sample(1, "ratio") },
      dry: { eligible: true, pue: sample(1.35, "kWh/kWh"), wueLPerItKwh: sample(0.1, "L/kWh"), buildMultiplier: sample(1.05, "ratio") },
    },
  };
  const checks: ValuationCheck[] = CHECK_IDS.map(id => ({ id, status: "pass", detail: "Sample check, not verified diligence." }));
  return valueProperty(input, checks, [{ inputs: { ...input, siteId: "sample-alternative", askingPriceTotal: sample(5e6, "USD") }, checks }]);
}
