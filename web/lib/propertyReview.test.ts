import { describe, expect, it } from "vitest";
import { askingPricePerAcre, emptyPropertyReview, loadPropertyReview, propertyReviewKey, savePropertyReview } from "./propertyReview";

function memoryStore() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("property-specific review storage", () => {
  it("keeps two properties and the existing project workspace independent", () => {
    const storage = memoryStore();
    storage.setItem("groundwork.workspace.v1", "existing-project-notes");
    const review = { ...emptyPropertyReview("costar-1"), notes: "Ask the utility for 100 MW.", decision: "investigate" as const, reviewed: ["power"] };
    expect(savePropertyReview(storage, "costar-1", null, review).ok).toBe(true);
    expect(loadPropertyReview(storage, "costar-1").review).toEqual(review);
    expect(loadPropertyReview(storage, "costar-2").review).toEqual(emptyPropertyReview("costar-2"));
    expect(storage.getItem("groundwork.workspace.v1")).toBe("existing-project-notes");
  });

  it("refuses to overwrite a newer saved draft from another tab", () => {
    const storage = memoryStore();
    const base = emptyPropertyReview("costar-1");
    const saved = savePropertyReview(storage, "costar-1", null, { ...base, notes: "Other tab's notes" });
    expect(saved.ok).toBe(true);
    expect(savePropertyReview(storage, "costar-1", null, { ...base, notes: "Stale draft" })).toEqual({ ok: false, reason: "conflict" });
    expect(loadPropertyReview(storage, "costar-1").review?.notes).toBe("Other tab's notes");
    if (saved.ok) expect(savePropertyReview(storage, "costar-1", saved.raw, { ...base, decision: "hold" }).ok).toBe(true);
  });

  it.each(["{", JSON.stringify({ version: 2 }), JSON.stringify(emptyPropertyReview("costar-2"))])("keeps invalid stored content intact: %s", (raw) => {
    const storage = memoryStore();
    storage.setItem(propertyReviewKey("costar-1"), raw);
    expect(loadPropertyReview(storage, "costar-1").status).toBe("invalid");
    expect(savePropertyReview(storage, "costar-1", raw, emptyPropertyReview("costar-1"))).toEqual({ ok: false, reason: "invalid" });
    expect(storage.getItem(propertyReviewKey("costar-1"))).toBe(raw);
  });

  it("rejects wrong identities, invalid decisions, excess notes and invented task IDs", () => {
    const storage = memoryStore();
    const base = emptyPropertyReview("costar-1");
    for (const review of [
      { ...base, propertyId: "costar-2" }, { ...base, decision: "buy" },
      { ...base, notes: "x".repeat(4001) }, { ...base, reviewed: ["made-up"] },
      { ...base, reviewed: ["power", "power"] }, { ...base, notes: null },
    ]) expect(savePropertyReview(storage, "costar-1", null, review)).toEqual({ ok: false, reason: "invalid" });
    expect(storage.getItem(propertyReviewKey("costar-1"))).toBeNull();
  });

  it("reports denied browser storage and quota exhaustion", () => {
    const denied = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(loadPropertyReview(denied, "costar-1").status).toBe("unavailable");
    expect(savePropertyReview(denied, "costar-1", null, emptyPropertyReview("costar-1"))).toEqual({ ok: false, reason: "unavailable" });
    expect(savePropertyReview({ getItem: () => null, setItem: denied.setItem }, "costar-1", null, emptyPropertyReview("costar-1"))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("does not accept a project UUID as a property ID", () => {
    const storage = memoryStore();
    const id = "00000000-0000-4000-8000-000000000001";
    expect(loadPropertyReview(storage, id).status).toBe("invalid");
    expect(savePropertyReview(storage, id, null, emptyPropertyReview(id))).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("recorded asking price per acre", () => {
  it("derives the recorded asking figure without generating a bid ceiling", () => {
    expect(askingPricePerAcre(2_500_000, 20)).toBe(125_000);
  });
  it.each([[null, 20], [200, null], [0, 10], [-10, 10], [10, 0], [10, -1], [Infinity, 10], [100, NaN], [Number.MAX_VALUE, Number.MIN_VALUE]])("leaves missing or invalid inputs unknown (%s, %s)", (price, acres) => {
    expect(askingPricePerAcre(price, acres)).toBeNull();
  });
});
