import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./safeFetch", async (original) => ({ ...await original<object>(), fetchPublicText: mocks.fetch }));
import { buildInvestigationPlan, runInvestigation, type ResearchClient } from "./investigator";
import { verifyAndStoreIntake, type IntakeDecision, type IntakeInput } from "./intakePipeline";
import { getIntakeSignals, reserveIntakeAttempt, reserveInvestigationRun } from "./intakeStore";
import { SafeFetchError } from "./safeFetch";
import { buildTimeline, parseSignals } from "./signals";
import { economics, stoppedShareForBand } from "./model";
import { parseModelCard } from "./modelCard";
import fixtures from "../../data/signals/risk_signals.json";
import modelArtifact from "../../data/model/risk_model.json";

const site = {
  project_id: "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9",
  name: "Highlander SM One LLC (San Marcos)", company: "Highlander SM One LLC",
  city: "San Marcos city", county: "Hays County",
};
const candidate = {
  source_url: "https://example.org/news", quote: "A sufficiently long quote about a local data center application was published here.",
  publication_date: "2025-09-30", signal_type: "application_filed", summary: "A planning application was filed.",
};
const plan = buildInvestigationPlan(site);
const client = (value: unknown): ResearchClient => ({ research: vi.fn(async () => value) });
const accepted: IntakeDecision = { decision: "accepted", reason: "Quote matched to source page text." };

afterEach(() => vi.useRealTimers());

describe("investigator plan and report", () => {
  it("builds a deterministic plan from public project facts only", () => {
    expect(buildInvestigationPlan(site)).toEqual(plan);
    expect(plan).toMatchObject({ projectId: site.project_id, projectName: site.name,
      facts: { name: site.name, company: site.company, city: site.city, county: site.county } });
    expect(plan.queries.length).toBeGreaterThan(0);
    expect(JSON.stringify(plan)).not.toContain("sourceText");
    expect(JSON.stringify(plan)).not.toContain("risk_score");
  });

  it("sends only the plan, verifies a candidate through the injected gate, and omits its prose from the report", async () => {
    const research = vi.fn(async (receivedPlan: typeof plan, signal: AbortSignal) => {
      expect(receivedPlan).toBe(plan);
      expect(signal).toBeInstanceOf(AbortSignal);
      return { candidates: [candidate] };
    });
    const verify = vi.fn(async (input: IntakeInput, deadlineAt: number) => {
      expect(input.project_id).toBe(plan.projectId);
      expect(deadlineAt).toBe(61_000);
      return accepted;
    });
    const report = await runInvestigation(plan, { research }, verify, { now: () => 1_000 });
    expect(research).toHaveBeenCalledOnce();
    expect(research.mock.calls[0][0]).toEqual(plan);
    expect(research.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
    expect(verify).toHaveBeenCalledWith({ ...candidate, project_id: site.project_id }, 61_000);
    expect(report).toMatchObject({ status: "complete", plan, truncatedCount: 0,
      candidates: [{ index: 0, source_url: candidate.source_url, decision: "accepted" }] });
    expect(report.unknowns.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain(candidate.quote);
    expect(JSON.stringify(report)).not.toContain(candidate.summary);
  });

  it.each([
    { candidates: [candidate], extra: true },
    { candidates: [{ ...candidate, extra: "untrusted" }] },
    { candidates: [{ ...candidate, quote: 12 }] },
    { candidates: [{ source_url: candidate.source_url }] },
    { candidates: [candidate, { ...candidate, summary: null }] },
  ])("fails malformed model structure closed before any verification: %j", async (raw) => {
    const verify = vi.fn(async () => accepted);
    const report = await runInvestigation(plan, client(raw), verify);
    expect(report.status).toBe("invalid_response");
    expect(report.candidates).toEqual([]);
    expect(verify).not.toHaveBeenCalled();
  });

  it("validates all returned structure before considering the first eight", async () => {
    const verify = vi.fn(async () => accepted);
    const raw = { candidates: [...Array.from({ length: 8 }, () => candidate), { ...candidate, summary: 3 }] };
    const report = await runInvestigation(plan, client(raw), verify);
    expect(report.status).toBe("invalid_response");
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns per-candidate invalid decisions for semantic errors without calling the gate", async () => {
    const verify = vi.fn(async () => accepted);
    const bad = [
      { ...candidate, signal_type: "outcome_denied" },
      { ...candidate, source_url: "http://example.org/article" },
      { ...candidate, publication_date: "not-a-date" },
      { ...candidate, quote: "too short" },
      { ...candidate, summary: "x".repeat(301) },
    ];
    const report = await runInvestigation(plan, client({ candidates: bad }), verify);
    expect(report.status).toBe("complete");
    expect(report.candidates.map((c) => c.decision)).toEqual(["invalid", "invalid", "invalid", "invalid", "invalid"]);
    expect(report.candidates[1].source_url).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it("considers no more than eight candidates and reports the excess", async () => {
    const verify = vi.fn(async () => accepted);
    const report = await runInvestigation(plan, client({ candidates: Array.from({ length: 300 }, (_, i) => ({ ...candidate,
      source_url: `https://example.org/news/${i}` })) }), verify);
    expect(report.status).toBe("complete");
    expect(report.candidates).toHaveLength(8);
    expect(report.truncatedCount).toBe(292);
    expect(verify).toHaveBeenCalledTimes(8);
  });

  it("sanitizes research failures and performs no verification", async () => {
    const verify = vi.fn(async () => accepted);
    const report = await runInvestigation(plan, { research: async () => { throw Error("secret token abc"); } }, verify);
    expect(report.status).toBe("research_failed");
    expect(JSON.stringify(report)).not.toContain("secret token abc");
    expect(verify).not.toHaveBeenCalled();
  });

  it("aborts research at the total deadline", async () => {
    vi.useFakeTimers();
    const verify = vi.fn(async () => accepted);
    let signal: AbortSignal | undefined;
    const research = vi.fn((_plan: typeof plan, received: AbortSignal): Promise<unknown> => {
      signal = received;
      return new Promise(() => {});
    });
    const pending = runInvestigation(plan, { research }, verify, { timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    const report = await pending;
    expect(report.status).toBe("deadline");
    expect(signal?.aborted).toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it("classifies a client rejection caused by abort as deadline rather than research failure", async () => {
    vi.useFakeTimers();
    const research = (_plan: typeof plan, signal: AbortSignal): Promise<unknown> => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("secret aborted request")), { once: true });
    });
    const pending = runInvestigation(plan, { research }, vi.fn(async () => accepted), { timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    const report = await pending;
    expect(report.status).toBe("deadline");
    expect(JSON.stringify(report)).not.toContain("secret aborted request");
  });

  it("stops after a verification exceeds the total deadline", async () => {
    vi.useFakeTimers();
    const verify = vi.fn((input: IntakeInput): Promise<IntakeDecision> => {
      expect(input.source_url).toBe(candidate.source_url);
      return new Promise(() => {});
    });
    const pending = runInvestigation(plan, client({ candidates: [candidate, candidate] }), verify, { timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    const report = await pending;
    expect(report.status).toBe("deadline");
    expect(verify).toHaveBeenCalledTimes(1);
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0].decision).toBe("deadline");
  });

  it("does not call research when no time remains", async () => {
    const research = vi.fn(async () => ({ candidates: [candidate] }));
    const verify = vi.fn(async () => accepted);
    const report = await runInvestigation(plan, { research }, verify, { timeoutMs: 0 });
    expect(report.status).toBe("deadline");
    expect(research).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it("stops after a deadline decision from the shared gate", async () => {
    const verify = vi.fn(async (): Promise<IntakeDecision> => ({ decision: "deadline", reason: "Time limit reached." }));
    const report = await runInvestigation(plan, client({ candidates: [candidate, candidate] }), verify);
    expect(report.status).toBe("deadline");
    expect(report.candidates).toHaveLength(1);
    expect(verify).toHaveBeenCalledOnce();
  });

  it("contains a rejected gate error without leaking its message", async () => {
    const verify = vi.fn(async () => { throw Error("secret upstream response"); });
    const report = await runInvestigation(plan, client({ candidates: [candidate] }), verify);
    expect(report.status).toBe("complete");
    expect(report.candidates[0].decision).toBe("fetch_failed");
    expect(JSON.stringify(report)).not.toContain("secret upstream response");
  });

  it("routes accepted, fabricated, blocked, duplicate and outcome candidates through the real intake gate", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    delete (globalThis as Record<string, unknown>).groundworkEvidenceIntake;
    delete (globalThis as Record<string, unknown>).groundworkInvestigationRuns;
    const id = crypto.randomUUID();
    const investigation = reserveInvestigationRun(id)!;
    const verified = { ...candidate, source_url: "https://example.org/verified" };
    const fabricated = { ...candidate, source_url: "https://example.org/fabricated" };
    const blocked = { ...candidate, source_url: "https://example.org/blocked" };
    const duplicate = { ...candidate, source_url: fixtures[1].source_url, quote: fixtures[1].quote };
    const outcome = { ...candidate, source_url: "https://example.org/outcome", signal_type: "outcome_denied" };
    mocks.fetch.mockReset().mockImplementation(async (url: string) => {
      if (url === blocked.source_url) throw new SafeFetchError("blocked_address", "secret private address");
      if (url === fabricated.source_url) return { text: "A different article without the proposed quote.",
        contentType: "text/plain", finalUrl: url, status: 200 };
      return { text: verified.quote, contentType: "text/plain", finalUrl: url, status: 200 };
    });
    const existing = parseSignals(fixtures);
    const before = buildTimeline(existing, plan.projectId, "watch");
    const outcomes = parseModelCard(modelArtifact).metrics.band_outcomes_oof;
    const beforeShare = stoppedShareForBand("watch", outcomes);
    const beforeEconomics = economics(beforeShare, 100);
    const report = await runInvestigation(plan, client({ candidates: [verified, fabricated, blocked, duplicate, outcome] }),
      (input, deadlineAt) => verifyAndStoreIntake(input, id, { proposedBy: "investigator", investigation, deadlineAt }));
    expect(report.candidates.map((item) => item.decision)).toEqual([
      "accepted", "quote_not_found", "blocked_address", "duplicate", "invalid",
    ]);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    const saved = getIntakeSignals(id);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ proposed_by: "investigator", effect: "context",
      verification: { publication_date_basis: "investigator", method: "verbatim_match" } });
    expect(getIntakeSignals(crypto.randomUUID())).toEqual([]);
    expect(buildTimeline([...existing, ...saved], plan.projectId, "watch").evidenceBand).toBe(before.evidenceBand);
    expect(stoppedShareForBand("watch", outcomes)).toBe(beforeShare);
    expect(economics(stoppedShareForBand("watch", outcomes), 100)).toEqual(beforeEconomics);
    expect(JSON.stringify(report)).not.toContain("secret private address");
  });

  it("never stores a page that resolves after the investigation deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    delete (globalThis as Record<string, unknown>).groundworkEvidenceIntake;
    delete (globalThis as Record<string, unknown>).groundworkInvestigationRuns;
    const id = crypto.randomUUID();
    const investigation = reserveInvestigationRun(id)!;
    let release: (() => void) | undefined;
    mocks.fetch.mockReset().mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { text: candidate.quote, contentType: "text/plain", finalUrl: candidate.source_url, status: 200 };
    });
    const pending = runInvestigation(plan, client({ candidates: [candidate] }),
      (input, deadlineAt) => verifyAndStoreIntake(input, id, { proposedBy: "investigator", investigation, deadlineAt }));
    for (let i = 0; i < 30 && mocks.fetch.mock.calls.length === 0; i++) await Promise.resolve();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    const report = await pending;
    expect(report).toMatchObject({ status: "deadline", candidates: [{ decision: "deadline" }] });
    expect(getIntakeSignals(id)).toEqual([]);
    expect(release).toBeTypeOf("function");
    release?.();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(getIntakeSignals(id)).toEqual([]);
  });

  it("allows eight investigator fetches after the visitor used all five manual attempts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    delete (globalThis as Record<string, unknown>).groundworkEvidenceIntake;
    delete (globalThis as Record<string, unknown>).groundworkInvestigationRuns;
    const id = crypto.randomUUID();
    for (let i = 0; i < 5; i++) expect(reserveIntakeAttempt(id)).toBe(true);
    const investigation = reserveInvestigationRun(id)!;
    mocks.fetch.mockReset().mockImplementation(async (url: string) => ({ text: candidate.quote,
      contentType: "text/plain", finalUrl: url, status: 200 }));
    const candidates = Array.from({ length: 8 }, (_, i) => ({ ...candidate, source_url: `https://example.org/source/${i}` }));
    const report = await runInvestigation(plan, client({ candidates }),
      (input, deadlineAt) => verifyAndStoreIntake(input, id, { proposedBy: "investigator", investigation, deadlineAt }));
    expect(report.candidates.map((item) => item.decision)).toEqual(Array(8).fill("accepted"));
    expect(mocks.fetch).toHaveBeenCalledTimes(8);
    expect(getIntakeSignals(id)).toHaveLength(8);
  });
});
