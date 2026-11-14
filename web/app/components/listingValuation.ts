// Server-side: one valuation per listing, from Marvin's real engine (web/lib/valuation.ts).
//
// TEMPORARY: Marvin is adding `valueListing(listing, { mw })` in web/lib/propertyValuation.ts, built from
// Noah's data/inputs/markets.json. Until it lands, `listingValuation` feeds the same engine with inputs
// tagged `sample`, so the engine marks the result sampleTainted and the UI labels it Sample.
// When valueListing exists, replace the body of listingValuation with:
//   return valueListing(listing, { mw });

import { checksForListing } from "@/lib/checks";
import type { Listing } from "@/lib/listings";
import { CONSTANTS } from "@/lib/model";
import { valueProperty } from "@/lib/valuation";
import type { PropertyValuation, Tagged, ValuationCheck, ValuationCheckId, ValuationInputs, ValueKind } from "@/lib/valuationTypes";

/** Demo workload: Noah sized both demo properties' existing service at about 1.5 MW of IT load. */
export const DEMO_MW = 1.5;

const CHECK_IDS: readonly ValuationCheckId[] = ["power", "water", "zoning", "opposition", "policy", "land", "labor"];
const GALLONS_PER_M3 = 264.172052;

const tag = (value: number | null, unit: string, kind: ValueKind, source: string, note?: string): Tagged => ({ value, unit, kind, source, ...(note ? { note } : {}) });
const sample = (value: number, unit: string, note?: string) => tag(value, unit, "sample", "sample:aj-placeholder", note);
const positive = (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 0 ? value : null;

// Placeholder market values. Several mirror Noah's markets.json, but the real mapping is Marvin's job.
const SAMPLE_MARKET = {
  houston: { landPerAcre: 400_000, buildUsdPerW: null, electricity: null, waterPerKgal: 9.34 },
  la: { landPerAcre: 3_000_000, buildUsdPerW: 15.01, electricity: 0.2412, waterPerKgal: 19.4 },
} as const;

export function listingChecks(listing: Listing): ValuationCheck[] {
  const byId = new Map(checksForListing(listing).map((check) => [check.id, check]));
  return CHECK_IDS.map((id) => {
    const check = byId.get(id);
    return { id, status: check?.status ?? "unknown", detail: check?.detail ?? "Not assessed." };
  });
}

function inputsFor(siteId: string, market: keyof typeof SAMPLE_MARKET, mw: number, acres: Tagged, price: Tagged): ValuationInputs {
  const m = SAMPLE_MARKET[market];
  return {
    siteId,
    mw: tag(mw, "MW", "assumed", "user:workload"),
    acres,
    askingPriceTotal: price,
    buildCostUsdPerW: m.buildUsdPerW == null
      ? tag(CONSTANTS.buildCostUsdPerW.value, "USD/W", "reported", CONSTANTS.buildCostUsdPerW.source, CONSTANTS.buildCostUsdPerW.note)
      : sample(m.buildUsdPerW, "USD/W", "Silicon Valley proxy for LA"),
    utilityConnectUsd: sample(0, "USD", "No sourced connection cost yet"),
    electricityUsdPerKwh: m.electricity == null
      ? tag(CONSTANTS.electricityUsdPerKwh.value, "USD/kWh", "reported", CONSTANTS.electricityUsdPerKwh.source, CONSTANTS.electricityUsdPerKwh.note)
      : sample(m.electricity, "USD/kWh", "California industrial average"),
    waterUsdPerM3: sample(m.waterPerKgal / 1000 * GALLONS_PER_M3, "USD/m3"),
    maintenanceRate: sample(0.02, "ratio"),
    avgLoad: tag(CONSTANTS.avgLoad.value, "ratio", "assumed", CONSTANTS.avgLoad.source, CONSTANTS.avgLoad.note),
    cooling: {
      evaporative: { eligible: true, pue: sample(1.2, "kWh/kWh"), wueLPerItKwh: sample(3.0, "L/kWh"), buildMultiplier: sample(1, "ratio") },
      dry: { eligible: true, pue: sample(1.5, "kWh/kWh"), wueLPerItKwh: sample(0, "L/kWh"), buildMultiplier: sample(1, "ratio") },
    },
  };
}

/** Valuation for one listing at the given IT workload. See the TEMPORARY note above. */
export function listingValuation(listing: Listing, mw: number): PropertyValuation {
  const market = listing.state === "CA" ? "la" : "houston";
  const acres = positive(listing.lot_acres);
  const price = positive(listing.asking_price);
  const subject = inputsFor(listing.site_id, market, mw,
    tag(acres, "acre", "reported", "costar"), tag(price, "USD", "reported", "costar", "CoStar asking price snapshot"));
  // Same-market benchmark with identical facility costs, so the ceiling equals the sample land price per acre.
  const benchmarkAcres = acres ?? 1;
  const benchmark = inputsFor(`benchmark-${market}`, market, mw, sample(benchmarkAcres, "acre"),
    sample(SAMPLE_MARKET[market].landPerAcre * benchmarkAcres, "USD", "Sample land price per acre × acres"));
  const allPass: ValuationCheck[] = CHECK_IDS.map((id) => ({ id, status: "pass", detail: "Sample benchmark site." }));
  return valueProperty(subject, listingChecks(listing), [{ inputs: benchmark, checks: allPass }]);
}
