import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { Signal } from "./signals";
import { addIntakeSignal, getIntakeSignals, isDuplicateSignal, reserveIntakeAttempt,
  reserveInvestigationAttempt, reserveInvestigationRun } from "./intakeStore";

const quote = "The city council voted to deny this application after public testimony.";
const project = "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9";
const signal = (id: string, url = "https://example.org/story", body = quote): Extract<Signal, { scope: "project" }> => ({
  signal_id: id, scope: "project", entity_id: project, check_id: "zoning", signal_type: "approval_failed", effect: "context",
  event_at: null, event_precision: "unknown", published_at: "2026-11-14", published_precision: "day",
  recorded_at: "2026-11-14T12:00:00Z", source_name: "Example", source_url: url,
  quote: body, summary: "City council decision",
  verification: { method: "verbatim_match", verified_at: "2026-11-14T12:00:00Z", publication_date_basis: "submitter" },
});

describe("private bounded intake store", () => {
  it("isolates UUID visitors, deduplicates canonical URL and normalized quote, and returns copies", async () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect(addIntakeSignal(a, signal("first"))).toBe("added");
    expect(addIntakeSignal(a, signal("second", "https://EXAMPLE.org:443/story#section", quote.replace(/ /g, "  ")))).toBe("duplicate");
    expect(getIntakeSignals(b)).toEqual([]);
    expect(getIntakeSignals(a)).toHaveLength(1);
    const copy = getIntakeSignals(a);
    copy[0].quote = "changed";
    copy[0].verification.method = "manual_review";
    expect(getIntakeSignals(a)[0].quote).toBe(quote);
    expect(getIntakeSignals(a)[0].verification.method).toBe("verbatim_match");
    expect(isDuplicateSignal(signal("candidate", "https://example.org/story#new"), [signal("fixture")])).toBe(true);
    expect(isDuplicateSignal(signal("candidate", "https://example.org/different"), [signal("fixture")])).toBe(false);
    expect(isDuplicateSignal({ ...signal("candidate"), entity_id: crypto.randomUUID() }, [signal("fixture")])).toBe(false);
    const { entity_id: ignored, ...shared } = signal("county");
    void ignored;
    const county: Signal = { ...shared, scope: "county", county: "Hays County", state: "TX", effect: "context" };
    expect(isDuplicateSignal(county, [signal("fixture")])).toBe(false);
    expect(isDuplicateSignal(county, [{ ...county, county: " hays county ", state: "tx" }])).toBe(true);
    expect(isDuplicateSignal(county, [{ ...county, county: "Travis County" }])).toBe(false);
    const projectCandidate = signal("submitted");
    expect(isDuplicateSignal(projectCandidate, [county])).toBe(false);
    expect(isDuplicateSignal(projectCandidate, [county], { county: " HAYS county ", state: "tx" })).toBe(true);
    expect(isDuplicateSignal(projectCandidate, [county], { county: "Travis County", state: "TX" })).toBe(false);
    expect(isDuplicateSignal(projectCandidate, [county], { county: "Hays County", state: "Texas" })).toBe(false);
    expect(isDuplicateSignal({ ...projectCandidate, entity_id: crypto.randomUUID() }, [signal("fixture")],
      { county: "Hays County", state: "TX" })).toBe(false);

    const city = { ...county, scope: "city", city: " Athens city ", county: " Henderson County ",
      state: "tx", signal_type: "ordinance_enacted", check_id: "policy" } as unknown as Signal;
    const athens = { city: "ATHENS CITY", county: "Henderson County", state: "TX", inCityLimits: true };
    expect(isDuplicateSignal(projectCandidate, [city], athens)).toBe(true);
    expect(isDuplicateSignal(projectCandidate, [city], { ...athens, inCityLimits: false })).toBe(false);
    expect(isDuplicateSignal(projectCandidate, [city], { ...athens, inCityLimits: null })).toBe(false);
    expect(isDuplicateSignal(projectCandidate, [city], { ...athens, city: "Mabank" })).toBe(false);
    expect(isDuplicateSignal(projectCandidate, [city], { ...athens, county: "Travis County" })).toBe(false);
    expect(isDuplicateSignal(projectCandidate, [city], { county: "Henderson County", state: "TX" })).toBe(false);
  });

  it("refuses invalid UUIDs, caps 20 records per visitor, and expires at 12 hours", () => {
    expect(getIntakeSignals("not-a-uuid")).toEqual([]);
    expect(reserveIntakeAttempt("not-a-uuid")).toBe(false);
    expect(addIntakeSignal("not-a-uuid", signal("invalid"))).toBe("store_full");
    const id = crypto.randomUUID();
    const now = Date.now();
    for (let i = 0; i < 20; i++) expect(addIntakeSignal(id, signal(`record-${i}`, `https://example.org/story/${i}`), now)).toBe("added");
    expect(addIntakeSignal(id, signal("overflow", "https://example.org/overflow"), now)).toBe("store_full");
    expect(getIntakeSignals(id)).toHaveLength(20);
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 12 * 60 * 60 * 1000);
    try { expect(getIntakeSignals(id)).toEqual([]); }
    finally { clock.mockRestore(); }
  });

  it("refuses the 201st visitor without evicting a live record", () => {
    // Move beyond earlier tests' TTL so this test owns the full visitor capacity.
    const now = Date.now() + 24 * 60 * 60 * 1000;
    const ids = Array.from({ length: 200 }, () => crypto.randomUUID());
    for (const [i, id] of ids.entries()) expect(addIntakeSignal(id, signal(`visitor-${i}`), now)).toBe("added");
    expect(addIntakeSignal(crypto.randomUUID(), signal("new-visitor"), now)).toBe("store_full");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try { expect(getIntakeSignals(ids[0])).toHaveLength(1); }
    finally { clock.mockRestore(); }
  });
});

describe("intake attempt reservation", () => {
  it("caps investigations at one per visitor/10 minutes and ten per process/hour", () => {
    delete (globalThis as Record<string, unknown>).groundworkInvestigationRuns;
    const id = crypto.randomUUID(), now = Date.now();
    expect(reserveInvestigationRun("invalid", now)).toBeNull();
    expect(reserveInvestigationRun(id, NaN)).toBeNull();
    expect(reserveInvestigationRun(id, now)).not.toBeNull();
    expect(reserveInvestigationRun(id, now + 599_999)).toBeNull();
    expect(reserveInvestigationRun(id, now + 600_000)).not.toBeNull();
    for (let i = 0; i < 8; i++) expect(reserveInvestigationRun(crypto.randomUUID(), now + 600_000)).not.toBeNull();
    expect(reserveInvestigationRun(crypto.randomUUID(), now + 600_000)).toBeNull();
    expect(reserveInvestigationRun(id, now + 3_600_000)).not.toBeNull();
  });
  it("counts failed attempts, applies five per visitor and resets after ten minutes", () => {
    const id = crypto.randomUUID();
    const now = Date.now() + 20 * 60 * 1000;
    for (let i = 0; i < 5; i++) expect(reserveIntakeAttempt(id, now)).toBe(true);
    expect(reserveIntakeAttempt(id, now)).toBe(false);
    expect(reserveIntakeAttempt(id, now + 10 * 60 * 1000)).toBe(true);
  });

  it("caps global attempts at 100 per ten-minute window", () => {
    const now = Date.now() + 60 * 60 * 1000;
    for (let i = 0; i < 100; i++) expect(reserveIntakeAttempt(crypto.randomUUID(), now)).toBe(true);
    expect(reserveIntakeAttempt(crypto.randomUUID(), now)).toBe(false);
    expect(reserveIntakeAttempt(crypto.randomUUID(), now + 10 * 60 * 1000)).toBe(true);
  });

  it("grants eight investigator attempts independent of the manual five, but shares the global cap", () => {
    delete (globalThis as Record<string, unknown>).groundworkEvidenceIntake;
    delete (globalThis as Record<string, unknown>).groundworkInvestigationRuns;
    const id = crypto.randomUUID(), now = Date.now();
    for (let i = 0; i < 5; i++) expect(reserveIntakeAttempt(id, now)).toBe(true);
    expect(reserveIntakeAttempt(id, now)).toBe(false);
    const run = reserveInvestigationRun(id, now);
    expect(run).not.toBeNull();
    for (let i = 0; i < 8; i++) expect(reserveInvestigationAttempt(id, run!, now)).toBe("allowed");
    expect(reserveInvestigationAttempt(id, run!, now)).toBe("run_limit");
    expect(reserveInvestigationAttempt(crypto.randomUUID(), run!, now)).toBe("invalid");
    expect(reserveIntakeAttempt(id, now)).toBe(false);
  });

  it("rejects a full-cap run without spending the visitor's run slot", () => {
    delete (globalThis as Record<string, unknown>).groundworkEvidenceIntake;
    delete (globalThis as Record<string, unknown>).groundworkInvestigationRuns;
    const now = Date.now(), id = crypto.randomUUID();
    for (let i = 0; i < 100; i++) expect(reserveIntakeAttempt(crypto.randomUUID(), now - 599_999)).toBe(true);
    expect(reserveInvestigationRun(id, now)).toBeNull();
    // Two milliseconds later the attempt window clears, while a consumed visitor run would remain active.
    const run = reserveInvestigationRun(id, now + 2);
    expect(run).not.toBeNull();
    expect(reserveInvestigationAttempt(id, run!, now + 2)).toBe("allowed");
  });

  it("does not spend the visitor's manual allowance when the investigator uses its eight attempts first", () => {
    delete (globalThis as Record<string, unknown>).groundworkEvidenceIntake;
    delete (globalThis as Record<string, unknown>).groundworkInvestigationRuns;
    const now = Date.now(), id = crypto.randomUUID();
    const run = reserveInvestigationRun(id, now)!;
    for (let i = 0; i < 8; i++) expect(reserveInvestigationAttempt(id, run, now)).toBe("allowed");
    for (let i = 0; i < 5; i++) expect(reserveIntakeAttempt(id, now)).toBe(true);
    expect(reserveIntakeAttempt(id, now)).toBe(false);
  });
});
