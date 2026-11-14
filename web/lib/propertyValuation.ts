import "server-only";
import fs from "node:fs";
import path from "node:path";
import { checksForListing } from "./checks";
import type { Listing } from "./listings";
import { CONSTANTS } from "./model";
import { valueProperty } from "./valuation";
import type { Alternative, CoolingDesign, PropertyValuation, Tagged, ValuationCheck, ValuationInputs, ValueKind } from "./valuationTypes";

type JsonObject = Readonly<Record<string, unknown>>;
const INPUT_FILE = "data/inputs/markets.json";
const CHECK_FILE = "data/inputs/demo_checks.json";
const CUBIC_METERS_PER_KGAL = 3.785411784; // 1,000 US gallons, exact conversion.
const CHECK_IDS = ["power", "water", "zoning", "opposition", "policy", "land", "labor"] as const;
const KINDS: readonly ValueKind[] = ["reported", "modeled", "assumed", "sample"];
// Temporary Round-3 scenario until Noah supplies the existing_building block.
// These are explicit assumptions, not engineering feasibility standards.
const assumedReuse = (value: number, unit: string): Tagged => ({ value, unit, kind: "assumed", source: "assumption:round3-building-reuse" });
const REUSE_FALLBACK = {
  build_multiplier: assumedReuse(0.85, "ratio"),
  applicability: { min_sf_per_mw: assumedReuse(10000, "SF/MW"), min_clear_height_ft: assumedReuse(18, "ft") },
};

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function unknown(unit: string, field: string): Tagged {
  return { value: null, unit, kind: "assumed", source: `missing:${field}` };
}

/** Noah's v1 schema declares units in field names and the conventions block. */
function marketNumber(value: unknown, unit: string, field: string): Tagged {
  const row = object(value);
  if (typeof row.value !== "number" || !Number.isFinite(row.value)
    || !KINDS.includes(row.kind as ValueKind) || typeof row.source !== "string" || !row.source.trim()
    || (row.unit !== undefined && row.unit !== unit)) return unknown(unit, field);
  const note = [row.scope, row.note].filter((part): part is string => typeof part === "string").join(" ");
  return { value: row.value, unit, kind: row.kind as ValueKind, source: row.source, ...(note ? { note } : {}) };
}

function computed(unit: string, tags: readonly Tagged[], calculate: (...values: number[]) => number): Tagged {
  const value = tags.some(tag => tag.value === null) ? null : calculate(...tags.map(tag => tag.value!));
  return {
    value: value !== null && Number.isFinite(value) ? value : null, unit,
    kind: tags.some(tag => tag.kind === "sample") ? "sample" : tags.some(tag => tag.kind === "assumed") ? "assumed" : "modeled",
    source: [...new Set(tags.map(tag => tag.source))].join("; "),
    note: tags.flatMap(tag => tag.note ? [tag.note] : []).join(" "),
  };
}

function readInputs(file: string): { data: JsonObject; missing: readonly string[] } {
  try {
    // Next and the repository's test scripts run with web/ as the working directory.
    const data = object(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", file), "utf8")));
    const collection = file === INPUT_FILE ? "markets" : "properties";
    return data.schema_version === 1 && data[collection] !== null && typeof data[collection] === "object" && !Array.isArray(data[collection])
      ? { data, missing: [] } : { data: {}, missing: [file] };
  } catch (error) {
    if (error instanceof SyntaxError || object(error).code === "ENOENT") return { data: {}, missing: [file] };
    // Do not conceal permissions/IO failures as missing market facts, or leak filesystem paths.
    throw new Error("Unable to read valuation inputs.");
  }
}

function coolingInputs(data: JsonObject, design: CoolingDesign, build: Tagged, reuse?: Tagged): ValuationInputs["cooling"][CoolingDesign] {
  const allCooling = object(data.cooling);
  const cooling = object(allCooling[design]);
  const multiplier = marketNumber(cooling.pue_multiplier, "ratio", `cooling.${design}.pue_multiplier`);
  const basePue: Tagged = { ...CONSTANTS.pue, unit: "kWh/kWh" };
  const delta = marketNumber(allCooling.capex_delta_usd_per_w, "USD/W", "cooling.capex_delta_usd_per_w");
  const constructionMultiplier = reuse ?? { value: 1, unit: "ratio", kind: "assumed", source: "assumption:evaporative-build-baseline" } as Tagged;
  return {
    // Cost-scenario assumption only, disclosed in valueListing's reasons.
    eligible: true,
    pue: computed("kWh/kWh", [basePue, multiplier], (base, factor) => base * factor),
    wueLPerItKwh: marketNumber(cooling.wue_l_per_kwh, "L/kWh", `cooling.${design}.wue_l_per_kwh`),
    buildMultiplier: design === "evaporative"
      ? constructionMultiplier
      : computed("ratio", [build, constructionMultiplier, delta], (cost, factor, extra) => (cost * factor + extra) / cost),
  };
}

type ReuseAssessment = { multiplier?: Tagged; reason: string };
function buildingReuse(listing: Listing, mw: number, data: JsonObject): ReuseAssessment {
  const fallback = !("existing_building" in data);
  const config = fallback ? REUSE_FALLBACK : object(data.existing_building);
  const applicability = object(config.applicability);
  const multiplier = marketNumber(config.build_multiplier, "ratio", "existing_building.build_multiplier");
  const sfPerMw = marketNumber(applicability.min_sf_per_mw, "SF/MW", "existing_building.applicability.min_sf_per_mw");
  const clearHeight = marketNumber(applicability.min_clear_height_ft, "ft", "existing_building.applicability.min_clear_height_ft");
  if (multiplier.value === null || multiplier.value <= 0 || multiplier.value > 1
    || sfPerMw.value === null || sfPerMw.value <= 0 || clearHeight.value === null || clearHeight.value <= 0) {
    return { reason: "Building-reuse adjustment not applied: invalid or incomplete reuse rule; full construction cost retained." };
  }
  const requiredSf = mw * sfPerMw.value;
  const fits = Number.isFinite(mw) && mw > 0 && Number.isFinite(requiredSf)
    && typeof listing.building_sf === "number" && Number.isFinite(listing.building_sf) && listing.building_sf >= requiredSf
    && typeof listing.ceiling_ft === "number" && Number.isFinite(listing.ceiling_ft) && listing.ceiling_ft >= clearHeight.value;
  const rule = `Requires ${sfPerMw.value.toLocaleString("en-US")} SF/MW and ${clearHeight.value} ft clear height; ${fallback ? "provisional assumed rule" : "market-file applicability rule"}.`;
  return fits ? { multiplier, reason: `Reuses the existing ${listing.building_sf!.toLocaleString("en-US")} SF building (build cost × ${multiplier.value}, ${multiplier.kind}, source ${multiplier.source}). ${rule} This is a cost scenario, not confirmation of structural, electrical, or cooling suitability.` }
    : { reason: `Building-reuse adjustment not applied: recorded building size or clear height is missing or insufficient. ${rule} Full construction cost retained.` };
}

function listingInputs(listing: Listing, mw: number, data: JsonObject, market: JsonObject, overrides: JsonObject, reuse?: Tagged): ValuationInputs {
  const build = marketNumber(market.build_cost_usd_per_w, "USD/W", "build_cost_usd_per_w");
  const water = marketNumber(market.water_usd_per_kgal, "USD/1000gal", "water_usd_per_kgal");
  return {
    siteId: listing.site_id,
    mw: { value: mw, unit: "MW", kind: "assumed", source: "assumption:requested-it-load" },
    acres: "acres_public_record" in overrides
      ? marketNumber({ value: overrides.acres_public_record, source: overrides.acres_public_record_source, note: overrides.acres_note, kind: "reported" }, "acre", "acres_public_record")
      : { value: listing.lot_acres, unit: "acre", kind: "reported", source: "CoStar property record" },
    askingPriceTotal: { value: listing.asking_price, unit: "USD", kind: "reported", source: "CoStar property record" },
    buildCostUsdPerW: build,
    utilityConnectUsd: marketNumber("utilityConnectUsd" in overrides ? overrides.utilityConnectUsd : market.utility_connect_usd, "USD", "utilityConnectUsd"),
    maintenanceRate: marketNumber(object(data.global).maintenance_rate, "ratio", "maintenanceRate"),
    avgLoad: { ...CONSTANTS.avgLoad, unit: "ratio" },
    electricityUsdPerKwh: marketNumber(market.electricity_usd_per_kwh, "USD/kWh", "electricity_usd_per_kwh"),
    waterUsdPerM3: computed("USD/m3", [water], cost => cost / CUBIC_METERS_PER_KGAL),
    cooling: { evaporative: coolingInputs(data, "evaporative", build, reuse), dry: coolingInputs(data, "dry", build, reuse) },
  };
}

function listingChecks(listing: Listing, overrides: JsonObject): ValuationCheck[] {
  const rows = Array.isArray(overrides.checks) ? overrides.checks.map(object) : [];
  return checksForListing(listing).flatMap(check => {
    const id = CHECK_IDS.find(id => id === check.id);
    if (!id) return [];
    const matches = rows.filter(row => row.id === id);
    if (!matches.length) return [{ id, status: check.status, detail: check.detail }];
    const row = matches[0];
    const evidenced = (entry: JsonObject) => typeof entry.detail === "string" && entry.detail.trim()
      && typeof entry.source === "string" && entry.source.trim();
    const failure = matches.find(entry => entry.status === "fail" && evidenced(entry));
    if (failure) return [{ id, status: "fail", detail: `${failure.detail} [source: ${failure.source}]` }];
    const valid = matches.length === 1 && ["pass", "watch", "fail", "unknown"].includes(String(row.status)) && evidenced(row);
    if (!valid) return [{ id, status: check.status === "fail" ? "fail" : "unknown", detail: `Invalid or duplicate hand-check override. ${check.detail}` }];
    return [{ id, status: row.status as ValuationCheck["status"], detail: `${row.detail} [source: ${row.source}]` }];
  });
}

function benchmarkAlternative(data: JsonObject, market: JsonObject, subject: ValuationInputs): readonly Alternative[] {
  const benchmark = object(market.benchmark_site);
  if (typeof benchmark.siteId !== "string" || !benchmark.siteId.trim() || benchmark.siteId.trim() === subject.siteId) return [];
  const tag = (key: string, unit: string) => {
    const original = marketNumber(benchmark[key], unit, `benchmark_site.${key}`);
    return { ...original, kind: original.kind === "sample" ? "sample" as const : "assumed" as const,
      note: `Hypothetical benchmark, not a verified listing. ${original.note ?? ""}` };
  };
  const build = tag("buildCostUsdPerW", "USD/W");
  const assumeCooling = (design: CoolingDesign) => {
    const cooling = coolingInputs(data, design, build);
    const assumed = (value: Tagged): Tagged => ({ ...value, kind: value.kind === "sample" ? "sample" : "assumed" });
    return { ...cooling, pue: assumed(cooling.pue), wueLPerItKwh: assumed(cooling.wueLPerItKwh), buildMultiplier: assumed(cooling.buildMultiplier) };
  };
  return [{ inputs: {
    siteId: benchmark.siteId.trim(), mw: tag("mw", "MW"), acres: tag("acres", "acre"),
    askingPriceTotal: tag("askingPriceTotal", "USD"), buildCostUsdPerW: build,
    utilityConnectUsd: tag("utilityConnectUsd", "USD"), electricityUsdPerKwh: tag("electricityUsdPerKwh", "USD/kWh"),
    waterUsdPerM3: tag("waterUsdPerM3", "USD/m3"), maintenanceRate: tag("maintenanceRate", "ratio"),
    avgLoad: { ...subject.avgLoad, kind: "assumed" },
    cooling: { evaporative: assumeCooling("evaporative"), dry: assumeCooling("dry") },
  }, checks: CHECK_IDS.map(id => ({ id, status: "pass", detail: "Assumed clear for hypothetical benchmark comparison; not verified diligence." })) }];
}

/** Server-side listing adapter. Missing evidence stays unknown; never uses synthetic defaults. */
export function valueListing(listing: Listing, opts: { mw: number }): PropertyValuation {
  const { data, missing } = readInputs(INPUT_FILE);
  const demo = readInputs(CHECK_FILE);
  const key = listing.state === "TX" ? "houston" : listing.state === "CA" ? "los_angeles" : "";
  const market = object(object(data.markets)[key]);
  const overrides = object(object(demo.data.properties)[listing.site_id]);
  const reuse = buildingReuse(listing, opts.mw, data);
  const inputs = listingInputs(listing, opts.mw, data, market, overrides, reuse.multiplier);
  const alternatives = benchmarkAlternative(data, market, inputs);
  const result = valueProperty(inputs, listingChecks(listing, overrides), alternatives);
  const missingInputs = [...new Set([...result.missingInputs, ...missing, ...demo.missing, ...(Object.keys(market).length ? [] : ["market"])])];
  return { ...result, missingInputs, reasons: [...result.reasons,
    reuse.reason,
    ...(missing.length ? ["Market input file is missing, invalid, or uses an unsupported schema."] : []),
    ...(demo.missing.length ? ["Hand-checked demo inputs unavailable; automatic listing checks retained."] : []),
    ...(!Object.keys(market).length ? ["No supported market inputs for this listing's state."] : []),
    "Both cooling designs are assumed available for cost comparison; utility capacity and design feasibility still require confirmation.",
    ...(alternatives.length ? ["The alternative is a hypothetical market benchmark with all checks assumed pass, not a verified eligible listing. Its original market-file check statuses are not used as diligence in this scenario."] : []),
    ...("detentionUsd" in object(market.benchmark_site) ? ["Benchmark detention/site works are excluded from this facility-cost comparison, consistent with the engine scope; not included in the maximum bid."] : []),
  ] };
}
