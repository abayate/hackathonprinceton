import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/listings";
import { listingChecks, listingValuation } from "./listingValuation";
import { cardReason, displayReasons, headline, maxPurchasePrice, missingLabels, parsePriority, parseReadyBy, sortByPriority } from "./valuationView";

const listing = (over: Partial<Listing> = {}): Listing => ({
  site_id: "costar-1", name: "Test", address: "1 Main", city: "Houston", state: "TX", county: "Harris", lat: 29.7, lng: -95.3,
  property_type: "Industrial", lot_acres: 2, building_sf: 40000, ceiling_ft: 30, column_width_ft: null, heavy_power: true,
  year_built: 1990, zoning: null, asking_price: 600_000, matterport_model_id: null, place: "Houston", in_city_limits: false,
  in_urban_area: true, county_density: 1000, nearest_metro: "Houston", km_to_metro: 5, county_tracked_projects: 1,
  water_stress_score: 2, water_stress_label: "Medium - High (20-40%)", p_stopped: 0.2, model_note: null, band: "green", ...over,
});

describe("listingValuation (Marvin's engine, sample inputs)", () => {
  it("is sample-tainted and caps at Maybe while the labor check is unknown", () => {
    const v = listingValuation(listing(), 1.5);
    expect(v.sampleTainted).toBe(true);
    expect(v.verdict).toBe("maybe");
    expect(missingLabels(v)).toContain("Labor check");
    expect(v.maxLandPricePerAcre.value).toBeCloseTo(400_000, 0);
    expect(headline(v)).toBe("Up to $400,000 per acre, once the open questions are answered.");
    expect(maxPurchasePrice(v).value).toBeCloseTo(800_000, 0);
  });

  it("passes when a check fails and says which", () => {
    const v = listingValuation(listing({ state: "CA", water_stress_label: "Extremely High (>80%)", p_stopped: null, band: null }), 1.5);
    expect(v.verdict).toBe("pass");
    expect(headline(v)).toBe("Pass: the water check failed.");
    expect(cardReason(v)).toMatch(/^water:/);
  });

  it("passes when asking is above the ceiling", () => {
    const v = listingValuation(listing({ asking_price: 2 * 900_000 }), 1.5);
    expect(v.verdict).toBe("pass");
    expect(headline(v)).toBe("Priced above its ceiling of $400,000 per acre.");
  });

  it("has no ceiling or ten-year total without an asking price", () => {
    const v = listingValuation(listing({ asking_price: null }), 1.5);
    expect(v.verdict).toBe("maybe");
    expect(v.tenYearCost.value).toBeNull();
    expect(missingLabels(v)).toContain("Asking price");
    expect(displayReasons(v).some((r) => r.startsWith("Missing"))).toBe(false);
  });

  it("maps all seven checks in engine order", () => {
    expect(listingChecks(listing()).map((c) => c.id)).toEqual(["power", "water", "zoning", "opposition", "policy", "land", "labor"]);
  });
});

describe("parsing and sorting", () => {
  it("falls back to defaults", () => {
    expect(parseReadyBy("1999")).toBe(2029);
    expect(parseReadyBy("2031")).toBe(2031);
    expect(parsePriority("nope")).toBe("recommended");
  });

  it("sorts by cost with unknowns last, and by verdict", () => {
    const item = (verdict: "buy" | "maybe" | "pass", cost: number | null) => ({ valuation: { verdict, tenYearCost: { value: cost } } }) as never;
    const items = [item("pass", 1), item("buy", null), item("maybe", 2)];
    const order = (xs: { valuation: { verdict: string } }[]) => xs.map((i) => i.valuation.verdict);
    expect(order(sortByPriority(items, "lowest_cost"))).toEqual(["pass", "maybe", "buy"]);
    expect(order(sortByPriority(items, "verdict"))).toEqual(["buy", "maybe", "pass"]);
    expect(sortByPriority(items, "recommended")).toBe(items);
  });
});
