import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { listListings } from "./listings";
import fs from "node:fs";
import { pool } from "./db";
import { valueListing } from "./propertyValuation";

/** Opt-in read-only integration: RUN_LISTING_VALUATION_LIVE=1 with DATABASE_URL configured.
 * Uses sponsor records in place; no sponsor snapshot or asking price is committed.
 * Expected verdicts reflect Noah's November 14 inputs and may change as data is revised.
 */
it.skipIf(process.env.RUN_LISTING_VALUATION_LIVE !== "1")("values all listings and three real demos at 1.5 MW", async () => {
  try {
    const listings = await listListings({ market: "all" });
    expect(listings).toHaveLength(158);
    const values = listings.map(listing => ({ listing, value: valueListing(listing, { mw: 1.5 }) }));
    const counts = { buy: values.filter(row => row.value.verdict === "buy").length,
      maybe: values.filter(row => row.value.verdict === "maybe").length,
      pass: values.filter(row => row.value.verdict === "pass").length };
    const ids = ["costar-238029", "costar-15609196", "costar-755901"];
    const demos = values.filter(row => ids.includes(row.listing.site_id)).map(({ listing, value }) => ({
      siteId: listing.site_id, verdict: value.verdict, missingInputs: value.missingInputs,
      maxPricePerAcre: value.maxLandPricePerAcre.value,
      totalPriceCeiling: value.maxLandPricePerAcre.value === null || value.acres.value === null
        ? null : value.maxLandPricePerAcre.value * value.acres.value,
      reasons: value.reasons,
    }));
    expect(demos).toHaveLength(3);
    for (const { value } of values) {
      if (value.maxLandPricePerAcre.value !== null && value.acres.value !== null && value.recommendedCooling) {
        expect(value.maxLandPricePerAcre.value * value.acres.value).toBeCloseTo(
          value.nextBestTenYearCost.value! - value.cooling[value.recommendedCooling].nonLandPv.value!, 6);
      }
    }
    if (process.env.VALUATION_TALLY_REPORT) {
      fs.writeFileSync(process.env.VALUATION_TALLY_REPORT, JSON.stringify({ total: listings.length, counts, demos }, null, 2));
    }
    const houston = listings.find(listing => listing.site_id === "costar-238029");
    const la = listings.find(listing => listing.site_id === "costar-755901");
    expect(houston).toBeDefined();
    expect(la).toBeDefined();
    const houstonValue = valueListing(houston!, { mw: 1.5 });
    const laValue = valueListing(la!, { mw: 1.5 });
    expect(houstonValue.verdict).toBe("buy");
    expect(houstonValue.missingInputs).toEqual([]);
    expect(houstonValue.reasons.some(reason => reason.startsWith("Reuses the existing"))).toBe(true);
    const secondHouston = demos.find(row => row.siteId === "costar-15609196")!;
    expect(secondHouston.verdict).toBe("pass");
    expect(secondHouston.reasons).toContain("The asking price exceeds the break-even maximum land price.");
    expect(secondHouston.missingInputs).toContain("checks.labor");
    expect(laValue.verdict).toBe("pass");
    expect(laValue.reasons.some(reason => reason.startsWith("water:") && reason.includes("Extremely High"))).toBe(true);
    expect(valueListing({ ...houston!, asking_price: null }, { mw: 1.5 }).verdict).toBe("maybe");
  } finally {
    await pool.end();
  }
}, 30000);
