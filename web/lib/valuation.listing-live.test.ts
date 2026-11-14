import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getListing } from "./listings";
import { pool } from "./db";
import { valueListing } from "./propertyValuation";

/** Opt-in read-only integration: RUN_LISTING_VALUATION_LIVE=1 with DATABASE_URL configured.
 * Uses sponsor records in place; no sponsor snapshot or asking price is committed.
 * Expected verdicts reflect Noah's November 14 inputs and may change as data is revised.
 */
it.skipIf(process.env.RUN_LISTING_VALUATION_LIVE !== "1")("values the two real demo listings at 1.5 MW", async () => {
  try {
    const houston = await getListing("costar-238029");
    const la = await getListing("costar-755901");
    expect(houston).not.toBeNull();
    expect(la).not.toBeNull();
    const houstonValue = valueListing(houston!, { mw: 1.5 });
    const laValue = valueListing(la!, { mw: 1.5 });
    expect(houstonValue.verdict).toBe("pass");
    expect(houstonValue.missingInputs).toEqual([]);
    expect(houstonValue.reasons).toContain("The asking price exceeds the break-even maximum land price.");
    expect(laValue.verdict).toBe("pass");
    expect(laValue.reasons.some(reason => reason.startsWith("water:") && reason.includes("Extremely High"))).toBe(true);
    expect(valueListing({ ...houston!, asking_price: null }, { mw: 1.5 }).verdict).toBe("maybe");
  } finally {
    await pool.end();
  }
}, 30000);
