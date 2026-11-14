import { describe, expect, it } from "vitest";
import { parsePriority, parseReadyBy, sampleValuation, sortByPriority } from "./valuation";

const base = { site_id: "costar-1", state: "TX", band: null } as const;
const req = { it_power_mw: 100, ready_by_year: 2029 };

describe("sampleValuation", () => {
  it("passes a parcel too small for the workload", () => {
    const v = sampleValuation({ ...base, lot_acres: 5, asking_price: 1_000_000 }, req);
    expect(v.verdict).toBe("pass");
    expect(v.sentence).toBe("Too small for this workload.");
  });

  it("buys well under the ceiling and downgrades a High-risk area to maybe", () => {
    const input = { ...base, lot_acres: 50, asking_price: 50 * 100_000 };
    expect(sampleValuation(input, req).verdict).toBe("buy");
    expect(sampleValuation({ ...input, band: "red" }, req).verdict).toBe("maybe");
  });

  it("passes above the ceiling and is maybe without a price", () => {
    expect(sampleValuation({ ...base, lot_acres: 50, asking_price: 50 * 900_000 }, req).verdict).toBe("pass");
    const unknown = sampleValuation({ ...base, lot_acres: 50, asking_price: null }, req);
    expect(unknown.verdict).toBe("maybe");
    expect(unknown.ten_year_cost_usd.value).toBeNull();
    expect(unknown.missing_inputs).toContain("Asking price");
  });

  it("tags its own outputs as sample and names the ready-by year", () => {
    const v = sampleValuation({ ...base, lot_acres: 50, asking_price: 5_000_000 }, req);
    expect(v.is_sample).toBe(true);
    expect(v.max_price_usd_per_acre.kind).toBe("sample");
    expect(v.ten_year_cost_usd.kind).toBe("sample");
    expect(v.missing_inputs.join(" ")).toContain("2029");
    expect(v.designs.map((d) => d.design_id)).toEqual(["evaporative", "dry"]);
    expect(v.designs[1].annual_water_gallons.value!).toBeLessThan(v.designs[0].annual_water_gallons.value!);
  });
});

describe("parsing and sorting", () => {
  it("falls back to defaults", () => {
    expect(parseReadyBy("1999")).toBe(2029);
    expect(parseReadyBy("2031")).toBe(2031);
    expect(parsePriority("nope")).toBe("recommended");
  });

  it("sorts by cost with unknowns last, and by verdict", () => {
    const item = (verdict: "buy" | "maybe" | "pass", cost: number | null) => ({ valuation: { verdict, ten_year_cost_usd: { value: cost } } }) as never;
    const items = [item("pass", 1), item("buy", null), item("maybe", 2)];
    expect(sortByPriority(items, "lowest_cost").map((i: { valuation: { verdict: string } }) => i.valuation.verdict)).toEqual(["pass", "maybe", "buy"]);
    expect(sortByPriority(items, "verdict").map((i: { valuation: { verdict: string } }) => i.valuation.verdict)).toEqual(["buy", "maybe", "pass"]);
    expect(sortByPriority(items, "recommended")).toBe(items);
  });
});
