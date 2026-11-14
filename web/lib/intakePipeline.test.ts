import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), site: vi.fn(), signals: vi.fn() }));
vi.mock("./safeFetch", async (original) => ({ ...await original<object>(), fetchPublicText: mocks.fetch }));
vi.mock("./publicStore", () => ({ getPublicSite: mocks.site }));
vi.mock("./signalStore", () => ({ getSignals: mocks.signals }));
import { SafeFetchError } from "./safeFetch";
import { parseIntakeInput, verifyAndStoreIntake } from "./intakePipeline";
import { getIntakeSignals, reserveIntakeAttempt, reserveInvestigationRun } from "./intakeStore";
import fixtures from "../../data/signals/risk_signals.json";

const input = { project_id: "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9", source_url: "https://example.org/article",
  quote: "The public hearing on this proposed data center will take place next Tuesday.",
  publication_date: "2026-01-01", signal_type: "application_filed", summary: "A public hearing was reported." };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
  delete (globalThis as Record<string, unknown>).groundworkEvidenceIntake;
  delete (globalThis as Record<string, unknown>).groundworkInvestigationRuns;
  mocks.fetch.mockReset().mockResolvedValue({ text: input.quote, contentType: "text/plain", finalUrl: input.source_url, status: 200 });
  mocks.site.mockReset().mockResolvedValue({ project_id: input.project_id, county: "Hays County" });
  mocks.signals.mockReset().mockResolvedValue(fixtures);
});
afterEach(() => vi.useRealTimers());

it("stores AI proposals as private context with an unverified publication day", async () => {
  const id = crypto.randomUUID();
  const investigation = reserveInvestigationRun(id)!;
  const result = await verifyAndStoreIntake(parseIntakeInput(input), id, { proposedBy: "investigator", investigation });
  expect(result).toMatchObject({ decision: "accepted", source_status: 200, signal: { proposed_by: "investigator", effect: "context",
    scope: "project", entity_id: input.project_id,
    verification: { method: "verbatim_match", publication_date_basis: "investigator" } } });
  expect(getIntakeSignals(id)).toEqual([result.signal]);
  expect(getIntakeSignals(crypto.randomUUID())).toEqual([]);
});
it("refuses investigator mode without an active run reservation before fetching", async () => {
  const id = crypto.randomUUID();
  const result = await verifyAndStoreIntake(parseIntakeInput(input), id, { proposedBy: "investigator" });
  expect(result).toMatchObject({ decision: "invalid" });
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(getIntakeSignals(id)).toEqual([]);
});
it("keeps investigator and manual visitor allowances separate", async () => {
  const id = crypto.randomUUID();
  for (let i = 0; i < 5; i++) reserveIntakeAttempt(id);
  const investigation = reserveInvestigationRun(id)!;
  const result = await verifyAndStoreIntake(parseIntakeInput(input), id, { proposedBy: "investigator", investigation });
  expect(result.decision).toBe("accepted");
  expect(mocks.fetch).toHaveBeenCalledOnce();
});
it("shares the manual fetch budget and refuses attempts before fetching", async () => {
  const id = crypto.randomUUID();
  for (let i = 0; i < 5; i++) reserveIntakeAttempt(id);
  expect((await verifyAndStoreIntake(parseIntakeInput(input), id)).decision).toBe("rate_limited");
  expect(mocks.fetch).not.toHaveBeenCalled(); expect(getIntakeSignals(id)).toEqual([]);
});
it("rejects fabricated quotes, blocked addresses and upstream failures without storage", async () => {
  const id = crypto.randomUUID();
  mocks.fetch.mockResolvedValueOnce({ text: "Nothing here", contentType: "text/plain", finalUrl: input.source_url, status: 200 });
  expect((await verifyAndStoreIntake(parseIntakeInput(input), id)).decision).toBe("quote_not_found");
  mocks.fetch.mockRejectedValueOnce(new SafeFetchError("blocked_address", "private secret details"));
  expect((await verifyAndStoreIntake(parseIntakeInput(input), id)).decision).toBe("blocked_address");
  mocks.fetch.mockRejectedValueOnce(new Error("private secret details"));
  const result = await verifyAndStoreIntake(parseIntakeInput(input), id);
  expect(result.decision).toBe("fetch_failed"); expect(JSON.stringify(result)).not.toContain("secret");
  expect(getIntakeSignals(id)).toEqual([]);
});
it("deduplicates public fixtures and session records including redirected URLs", async () => {
  const id = crypto.randomUUID();
  const fixture = fixtures[1];
  const duplicate = parseIntakeInput({ ...input, source_url: fixture.source_url, quote: fixture.quote });
  expect((await verifyAndStoreIntake(duplicate, id)).decision).toBe("duplicate");
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect((await verifyAndStoreIntake(parseIntakeInput(input), id)).decision).toBe("accepted");
  expect((await verifyAndStoreIntake(parseIntakeInput(input), id)).decision).toBe("duplicate");
  expect((await verifyAndStoreIntake(parseIntakeInput({ ...input, source_url: "https://example.org/redirect" }), id)).decision).toBe("duplicate");
  expect(getIntakeSignals(id)).toHaveLength(1);
});
it("deduplicates applicable county evidence before fetch and after redirects without suppressing other counties", async () => {
  const county = fixtures[2];
  const submitted = parseIntakeInput({ ...input, source_url: county.source_url, quote: county.quote,
    signal_type: "moratorium_proposed" });
  expect((await verifyAndStoreIntake(submitted, crypto.randomUUID())).decision).toBe("duplicate");
  expect(mocks.fetch).not.toHaveBeenCalled();

  mocks.fetch.mockResolvedValueOnce({ text: county.quote, contentType: "text/plain", finalUrl: county.source_url, status: 200 });
  const redirected = parseIntakeInput({ ...submitted, source_url: "https://example.org/redirect-to-kvue" });
  expect((await verifyAndStoreIntake(redirected, crypto.randomUUID())).decision).toBe("duplicate");

  mocks.site.mockResolvedValueOnce({ project_id: input.project_id, county: "Travis County" });
  mocks.fetch.mockResolvedValueOnce({ text: county.quote, contentType: "text/plain", finalUrl: county.source_url, status: 200 });
  expect((await verifyAndStoreIntake(submitted, crypto.randomUUID())).decision).toBe("accepted");
});
it("deduplicates city evidence for an inside-city project, before and after redirects only", async () => {
  const city = { ...fixtures[2], scope: "city", city: "Athens city", county: "Henderson County", state: "TX",
    signal_type: "ordinance_enacted", effect: "context", check_id: "policy" };
  mocks.signals.mockResolvedValue([city]);
  const athens = { project_id: input.project_id, city: "Athens city", county: "Henderson County", in_city_limits: true };
  mocks.site.mockResolvedValue(athens);
  const sameSource = parseIntakeInput({ ...input, source_url: city.source_url, quote: city.quote });
  expect((await verifyAndStoreIntake(sameSource, crypto.randomUUID())).decision).toBe("duplicate");
  expect(mocks.fetch).not.toHaveBeenCalled();

  const redirected = parseIntakeInput({ ...sameSource, source_url: "https://example.org/redirect-to-city" });
  mocks.fetch.mockResolvedValueOnce({ text: city.quote, contentType: "text/plain", finalUrl: city.source_url, status: 200 });
  expect((await verifyAndStoreIntake(redirected, crypto.randomUUID())).decision).toBe("duplicate");

  for (const location of [{ ...athens, in_city_limits: false }, { ...athens, city: "Mabank" },
    { ...athens, county: "Travis County" }, { ...athens, city: null }]) {
    mocks.site.mockResolvedValueOnce(location);
    mocks.fetch.mockResolvedValueOnce({ text: city.quote, contentType: "text/plain", finalUrl: city.source_url, status: 200 });
    expect((await verifyAndStoreIntake(sameSource, crypto.randomUUID())).decision).toBe("accepted");
  }
});
it("never stores or starts a fetch at or beyond a run deadline", async () => {
  const id = crypto.randomUUID(); const deadlineAt = Date.now() + 100;
  expect((await verifyAndStoreIntake(parseIntakeInput(input), id, { deadlineAt: Date.now() })).decision).toBe("deadline");
  expect(mocks.fetch).not.toHaveBeenCalled();
  mocks.fetch.mockImplementationOnce(async () => {
    vi.setSystemTime(new Date(deadlineAt));
    return { text: input.quote, contentType: "text/plain", finalUrl: input.source_url, status: 200 };
  });
  expect((await verifyAndStoreIntake(parseIntakeInput(input), id, { deadlineAt })).decision).toBe("deadline");
  expect(getIntakeSignals(id)).toEqual([]);
  expect(mocks.fetch).toHaveBeenCalledWith(input.source_url, { timeoutMs: 100 });
});
it("validates input without echoing untrusted data", () => {
  for (const override of [{ scope: "county" }, { scope: "city" }, { city: "Athens city" }, { county: "Hays County" }, { state: "TX" },
    { signal_type: "ordinance_enacted" }, { signal_type: "outcome_denied" }, { signal_type: "outcome_suspended" }, { signal_type: "outcome_withdrawn" }, { project_id: "bad" }, { quote: "short" },
    { source_url: "javascript:alert(1)" }, { publication_date: "9999-01-01" }, { summary: "" }]) {
    expect(() => parseIntakeInput({ ...input, ...override })).toThrow();
  }
  expect(parseIntakeInput({ ...input, source_url: input.source_url + "#quote", summary: " summary " }))
    .toMatchObject({ source_url: input.source_url, summary: "summary" });
  expect(parseIntakeInput({ ...input, summary: "x".repeat(1000) }).summary).toHaveLength(1000);
  expect(() => parseIntakeInput({ ...input, summary: "x".repeat(1001) })).toThrow();
});
