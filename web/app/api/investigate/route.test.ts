import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ cookie: vi.fn(), site: vi.fn(), research: vi.fn(), fetchPage: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/publicStore", () => ({ getPublicSite: mocks.site }));
vi.mock("@/lib/geminiClient", async (original) => ({ ...await original<object>(),
  createGeminiClient: () => ({ research: mocks.research }) }));
vi.mock("@/lib/safeFetch", async (original) => ({ ...await original<object>(), fetchPublicText: mocks.fetchPage }));
import { POST } from "./route";
import { addIntakeSignal, getIntakeSignals, reserveIntakeAttempt, reserveInvestigationRun } from "@/lib/intakeStore";
import { parseSignals } from "@/lib/signals";
import fixtures from "../../../../data/signals/risk_signals.json";

const project = "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9";
const visitor = "36793d56-a761-4cc0-9348-23a4470cad5b";
const key = "test-private-gemini-key";
const candidate = { source_url: "https://example.org/article", quote: "A public hearing on the proposed data center has been scheduled for next Tuesday.",
  publication_date: "2026-01-01", signal_type: "application_filed", summary: "A hearing is reported." };
const request = (body: unknown = { project_id: project }, headers = {}) => new Request("http://localhost/api/investigate", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers },
});
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("DATA_MODE", "public"); vi.stubEnv("ENABLE_INVESTIGATOR", "true"); vi.stubEnv("GEMINI_API_KEY", key);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No outbound requests permitted")));
  delete (globalThis as Record<string, unknown>).groundworkEvidenceIntake;
  delete (globalThis as Record<string, unknown>).groundworkInvestigationRuns;
  mocks.cookie.mockReturnValue({ value: visitor }); mocks.site.mockResolvedValue({ project_id: project, name: "Highlander", company: "Example", city: "San Marcos", county: "Hays" });
  mocks.research.mockResolvedValue({ candidates: [candidate] });
  mocks.fetchPage.mockResolvedValue({ text: candidate.quote, contentType: "text/plain", finalUrl: candidate.source_url, status: 200 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("makes zero outbound calls for flag-off, unsupported mode or no key", async () => {
  vi.stubEnv("ENABLE_INVESTIGATOR", "TRUE"); expect((await POST(request())).status).toBe(404);
  vi.stubEnv("ENABLE_INVESTIGATOR", "true"); vi.stubEnv("DATA_MODE", undefined); expect((await POST(request())).status).toBe(501);
  vi.stubEnv("DATA_MODE", "public"); vi.stubEnv("GEMINI_API_KEY", undefined);
  const res = await POST(request()); expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ detail: "Investigator is not configured" });
  expect(fetch).not.toHaveBeenCalled(); expect(mocks.fetchPage).not.toHaveBeenCalled(); expect(mocks.research).not.toHaveBeenCalled();
});
it.each([null, [], {}, { project_id: "bad" }, { project_id: project, key }, "{"])("rejects invalid input before research %j", async (body) => {
  const res = await POST(request(body)); expect(res.status).toBe(422);
  expect(JSON.stringify(await res.json())).not.toContain(key); expect(mocks.research).not.toHaveBeenCalled();
});
it("bounds the request and checks browser origin against Host", async () => {
  for (const req of [request({}, { Origin: "https://attacker.example" }), request({}, { Origin: "bad" }),
    request({}, { "Content-Type": "text/plain" }), request({}, { "Content-Length": "999999" }), request("x".repeat(5_000)),
    new Request("http://localhost/api/investigate", { method: "POST", headers: { "Content-Type": "application/json" } })]) {
    expect((await POST(req)).status).toBe(422);
  }
  expect(mocks.research).not.toHaveBeenCalled();
  expect((await POST(request(undefined, { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" }))).status).toBe(200);
});
it("rejects unknown projects and hides unexpected server errors", async () => {
  mocks.site.mockResolvedValueOnce(null);
  expect((await POST(request())).status).toBe(422);
  mocks.site.mockRejectedValueOnce(new Error(key));
  const res = await POST(request()); expect(res.status).toBe(502);
  expect(JSON.stringify(await res.json())).not.toContain(key); expect(mocks.research).not.toHaveBeenCalled();
});
it("runs the fake client through the real verification gate and private store", async () => {
  const res = await POST(request()); expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("no-store");
  const report = await res.json();
  expect(report).toMatchObject({ status: "complete", candidates: [{ decision: "accepted", signal: { effect: "context", proposed_by: "investigator" } }] });
  expect(getIntakeSignals(visitor)).toHaveLength(1); expect(getIntakeSignals(crypto.randomUUID())).toEqual([]);
  expect(mocks.research).toHaveBeenCalledOnce(); expect(mocks.fetchPage).toHaveBeenCalledOnce();
  expect(JSON.stringify(report)).not.toContain(key);
});
it("returns 429 when the run cannot start or the combined global attempt cap is full", async () => {
  reserveInvestigationRun(visitor);
  expect((await POST(request())).status).toBe(429); expect(mocks.research).not.toHaveBeenCalled();
  delete (globalThis as Record<string, unknown>).groundworkInvestigationRuns;
  for (let i = 0; i < 100; i++) reserveIntakeAttempt(crypto.randomUUID());
  const res = await POST(request()); expect(res.status).toBe(429);
  expect(await res.json()).toMatchObject({ detail: "Investigation limit reached. Try again later." });
  expect(mocks.research).not.toHaveBeenCalled(); expect(mocks.fetchPage).not.toHaveBeenCalled();
  delete (globalThis as Record<string, unknown>).groundworkEvidenceIntake;
  expect((await POST(request())).status).toBe(200);
  expect(mocks.research).toHaveBeenCalledOnce(); expect(mocks.fetchPage).toHaveBeenCalledOnce();
});
it("returns 200 when manual attempts have exhausted their separate visitor allowance", async () => {
  for (let i = 0; i < 5; i++) reserveIntakeAttempt(visitor);
  mocks.research.mockResolvedValue({ candidates: [{ ...candidate, signal_type: "outcome_denied" }, candidate,
    { ...candidate, source_url: "https://example.org/second" }] });
  mocks.fetchPage.mockImplementation(async (url: string) => ({ text: candidate.quote,
    contentType: "text/plain", finalUrl: url, status: 200 }));
  const res = await POST(request()); expect(res.status).toBe(200);
  const report = await res.json();
  expect(report.candidates.map((c: { decision: string }) => c.decision)).toEqual(["invalid", "accepted", "accepted"]);
  expect(getIntakeSignals(visitor)).toHaveLength(2);
});
it("verifies eight distinct candidates within one run and returns 200", async () => {
  const candidates = Array.from({ length: 8 }, (_, i) => ({ ...candidate, source_url: `https://example.org/source/${i}` }));
  mocks.research.mockResolvedValue({ candidates });
  mocks.fetchPage.mockImplementation(async (url: string) => ({ text: candidate.quote,
    contentType: "text/plain", finalUrl: url, status: 200 }));
  const res = await POST(request()); expect(res.status).toBe(200);
  const report = await res.json();
  expect(report.candidates).toHaveLength(8);
  expect(report.candidates.every((item: { decision: string }) => item.decision === "accepted")).toBe(true);
  expect(mocks.fetchPage).toHaveBeenCalledTimes(8);
  expect(getIntakeSignals(visitor)).toHaveLength(8);
});
it("returns 429 when the shared global cap stops a partially accepted run", async () => {
  for (let i = 0; i < 99; i++) reserveIntakeAttempt(crypto.randomUUID());
  mocks.research.mockResolvedValue({ candidates: [candidate, { ...candidate, source_url: "https://example.org/second" }] });
  const res = await POST(request()); expect(res.status).toBe(429);
  const report = await res.json();
  expect(report.candidates.map((item: { decision: string; limit_scope?: string }) => [item.decision, item.limit_scope]))
    .toEqual([["accepted", undefined], ["rate_limited", "global"]]);
  expect(mocks.fetchPage).toHaveBeenCalledOnce();
  expect(getIntakeSignals(visitor)).toHaveLength(1);
});
it("keeps storage-full as a candidate decision in a completed 200 report", async () => {
  const base = parseSignals([fixtures[1]])[0];
  for (let i = 0; i < 20; i++) expect(addIntakeSignal(visitor, { ...base,
    signal_id: `saved-${i}`, source_url: `https://example.org/already/${i}` })).toBe("added");
  const res = await POST(request()); expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ candidates: [{ decision: "store_full" }] });
  expect(getIntakeSignals(visitor)).toHaveLength(20);
});
it("sets a private cookie for new or invalid visitors", async () => {
  for (const cookie of [undefined, { value: "invalid" }]) {
    mocks.cookie.mockReturnValueOnce(cookie);
    const res = await POST(request()); expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/client_id=[a-f0-9-]{36}/);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly"); expect(res.headers.get("set-cookie")).toContain("SameSite=lax");
  }
});
it("does not log or return upstream errors containing a key", async () => {
  const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
  mocks.research.mockRejectedValue(new Error(key));
  const res = await POST(request());
  expect(await res.json()).toMatchObject({ status: "research_failed" });
  expect(logs.flatMap((spy) => spy.mock.calls)).toEqual([]); expect(getIntakeSignals(visitor)).toEqual([]);
});
