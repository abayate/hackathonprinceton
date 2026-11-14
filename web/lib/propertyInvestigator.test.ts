import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createMemoryStore } from "./gwStore";
import { sampleValuation } from "./valuation";
import {
  acceptDraft, figuresFor, memoDigest, newRun, runPropertyInvestigation, usd, valuationForMemo, verifyMemoDigest,
  type MemoDraft, type MemoWriter, type PropertyFacts, type ValuationForMemo,
} from "./propertyInvestigator";

// Synthetic facts; not a real listing.
const facts: PropertyFacts = {
  property_id: "costar-900001", name: "Synthetic Yard", address: "100 Test Way", city: "Houston", state: "TX",
  county: "Harris", property_type: "Land", lot_acres: 40, building_sf: null, zoning: null, heavy_power: true,
  year_built: null, asking_price: 8_000_000,
};
const valuation: ValuationForMemo = {
  verdict: "buy", reasons: ["Asking price is under the maximum."],
  max_price_usd_per_acre: { value: 250_000, unit: "USD/acre", kind: "modeled", source_id: null },
  ten_year_cost_usd: { value: 1_500_000_000, unit: "USD", kind: "modeled", source_id: null },
  missing_inputs: ["Utility capacity letter"],
  mw: { value: 1.5, unit: "MW", kind: "assumed", source_id: null },
  sample: false,
};
const draft: MemoDraft = {
  summary: "Buy up to $250,000/acre; asking is $200,000/acre.",
  sections: [
    { id: "land", body_md: "40 acres listed at $8,000,000.", source_ids: ["costar", "made-up"] },
    { id: "power_water", body_md: "CenterPoint serves the area.", source_ids: ["web-1"] },
  ],
  deal_risks: ["Flood zone not confirmed."],
  open_questions: ["Is 100 MW available by 2029?"],
  web_sources: [
    { source_id: "web-1", title: "Utility page", url: "https://example.com/utility" },
    { source_id: "web-2", title: "Insecure", url: "http://example.com/x" },
  ],
};

describe("figures and drafts", () => {
  it("formats only known figures, tagged with their kind", () => {
    expect(figuresFor(facts, valuation).map((f) => [f.display, f.kind])).toEqual([
      ["$8,000,000", "reported"], ["$200,000/acre", "reported"], ["$250,000/acre", "modeled"], ["$1,500,000,000", "modeled"],
    ]);
    const unknown = { value: null, unit: "USD", kind: "modeled" as const, source_id: null };
    expect(figuresFor({ ...facts, asking_price: null, lot_acres: null }, { ...valuation, max_price_usd_per_acre: unknown, ten_year_cost_usd: unknown })).toEqual([]);
    // A negative maximum (free land still loses) is never offered as a quotable figure.
    expect(figuresFor({ ...facts, asking_price: null }, { ...valuation, max_price_usd_per_acre: { ...unknown, value: -5 }, ten_year_cost_usd: unknown })).toEqual([]);
    expect(usd(1234.6)).toBe("$1,235");
  });

  it("accepts a draft, drops unknown source ids and non-HTTPS sources", () => {
    const parts = acceptDraft(draft, figuresFor(facts, valuation));
    expect(parts.sections[0]).toMatchObject({ id: "land", title: "Land and building", source_ids: ["costar"] });
    expect(parts.sources.map((s) => s.source_id)).toEqual(["costar", "web-1"]);
  });

  it("rejects a dollar figure the model invented", () => {
    const bad = { ...draft, deal_risks: ["Grid upgrade could cost $40,000,000."] };
    expect(() => acceptDraft(bad, figuresFor(facts, valuation))).toThrow("did not come from the model");
  });

  it("rejects empty or malformed drafts", () => {
    expect(() => acceptDraft(null, [])).toThrow();
    expect(() => acceptDraft({ ...draft, summary: "" }, [])).toThrow("no summary");
    expect(() => acceptDraft({ ...draft, sections: [{ id: "other", body_md: "x", source_ids: [] }] }, [])).toThrow("no usable sections");
  });
});

describe("valuationForMemo", () => {
  it("maps the engine output and caps a sample-data Buy at Maybe", () => {
    const engine = sampleValuation();
    expect(engine.verdict).toBe("buy");
    const mapped = valuationForMemo(engine);
    expect(mapped.verdict).toBe("maybe");
    expect(mapped.reasons[0]).toContain("capped at Maybe");
    expect(mapped.sample).toBe(true);
    expect(mapped.max_price_usd_per_acre).toEqual({ value: 250_000, unit: "USD/acre", kind: "sample",
      source_id: "sample:valuation-demo; assignment:analysis-period; assignment:discount-rate" });
    expect(mapped.ten_year_cost_usd.kind).toBe("sample");
  });

  it("passes a non-sample verdict through unchanged", () => {
    const engine = { ...sampleValuation(), sampleTainted: false, verdict: "pass" as const };
    expect(valuationForMemo(engine)).toMatchObject({ verdict: "pass", sample: false });
    expect(valuationForMemo({ ...engine, verdict: "buy" }).verdict).toBe("buy");
  });
});

describe("runPropertyInvestigation", () => {
  const writer = (impl: MemoWriter["write"]): MemoWriter => ({ write: impl });

  it("writes steps, saves a hashed memo and takes the verdict from the valuation", async () => {
    const store = createMemoryStore();
    const run = newRun(facts.property_id);
    await store.saveRun(run);
    await runPropertyInvestigation(run, facts, valuation, writer(async () => draft), store);
    const saved = await store.loadRun(run.run_id);
    expect(saved).toMatchObject({ status: "done", error: null });
    expect(saved!.steps.map((s) => [s.action, s.status])).toEqual([
      ["plan", "done"], ["get_costar_record", "done"], ["quote_valuation", "done"], ["research_and_write", "done"], ["compose_memo", "done"],
    ]);
    const memo = (await store.loadMemo(saved!.memo_id!))!;
    expect(memo.recommendation).toBe("buy");
    expect(memo.max_price_usd_per_acre.value).toBe(250_000);
    expect(memo.open_questions[0]).toBe("Missing input: Utility capacity letter.");
    expect(memo.attestation.status).toBe("unavailable");
    expect(memo.digest_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyMemoDigest(memo)).toBe(true);
    expect(verifyMemoDigest({ ...memo, summary: "tampered" })).toBe(false);
    expect(memoDigest({ ...memo, live: false })).toBe(memo.digest_sha256);
    expect(await store.loadLatestMemo(facts.property_id)).toMatchObject({ memo_id: memo.memo_id });
  });

  it("ends with a safe error when the writer fails, invents a number or runs out of time", async () => {
    const cases: [MemoWriter, string][] = [
      [writer(async () => { throw new Error("upstream secret detail"); }), "The memo writer is unavailable."],
      [writer(async () => ({ ...draft, summary: "Costs $9." })), "The memo quoted a dollar figure that did not come from the model."],
      [writer((_input, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))),
        "The investigation ran out of time."],
    ];
    for (const [w, message] of cases) {
      const store = createMemoryStore();
      const run = newRun(facts.property_id);
      await store.saveRun(run);
      await runPropertyInvestigation(run, facts, valuation, w, store, { deadlineMs: 5 });
      const saved = await store.loadRun(run.run_id);
      expect(saved).toMatchObject({ status: "error", error: message, memo_id: null });
      expect(saved!.steps.at(-1)!.status).toBe("error");
    }
  });

  it("passes only public facts and supplied figures to the writer", async () => {
    const store = createMemoryStore();
    const run = newRun(facts.property_id);
    await store.saveRun(run);
    const write = vi.fn<MemoWriter["write"]>(async () => draft);
    await runPropertyInvestigation(run, facts, valuation, { write }, store);
    const input = write.mock.calls[0][0];
    expect(input.property).not.toHaveProperty("property_id");
    expect(input.verdict).toBe("buy");
    expect(input.figures).toHaveLength(4);
  });

  it("does not throw when storage fails mid-run", async () => {
    const store = createMemoryStore();
    const run = newRun(facts.property_id); // never saved: every update fails
    await expect(runPropertyInvestigation(run, facts, valuation, writer(async () => draft), store)).resolves.toBeUndefined();
  });
});
