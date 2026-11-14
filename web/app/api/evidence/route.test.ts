import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookieGet: vi.fn(), site: vi.fn(), fetch: vi.fn(), verify: vi.fn(),
  records: vi.fn(), reserve: vi.fn(), add: vi.fn(), duplicate: vi.fn(), fixtures: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookieGet }) }));
vi.mock("@/lib/publicStore", () => ({ getPublicSite: mocks.site }));
vi.mock("@/lib/signalStore", () => ({ getSignals: mocks.fixtures }));
vi.mock("@/lib/safeFetch", () => ({ fetchPublicText: mocks.fetch,
  SafeFetchError: class extends Error { constructor(public code: string, message: string) { super(message); } } }));
vi.mock("@/lib/quoteVerify", () => ({ verifyQuote: mocks.verify, normalizeQuote: (value: string) => value.trim().replace(/\s+/g, " ") }));
vi.mock("@/lib/intakeStore", () => ({ getIntakeSignals: mocks.records, reserveIntakeAttempt: mocks.reserve,
  addIntakeSignal: mocks.add, isDuplicateSignal: mocks.duplicate }));
import { POST } from "./route";
import { SafeFetchError } from "@/lib/safeFetch";

const project = "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9";
const visitor = "36793d56-a761-4cc0-9348-23a4470cad5b";
const input = { project_id: project, source_url: "https://example.org/article#text", quote: "This is a sufficiently long public sentence about a new data center application.",
  publication_date: "2026-01-01", signal_type: "application_filed", summary: "A new application was reported." };
const request = (body: unknown = input, headers: Record<string, string> = {}) => new Request("http://localhost/api/evidence", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers },
});

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("DATA_MODE", "public"); vi.stubEnv("ENABLE_EVIDENCE_INTAKE", "true");
  mocks.cookieGet.mockReturnValue({ value: visitor }); mocks.site.mockResolvedValue({ project_id: project });
  mocks.fetch.mockResolvedValue({ text: input.quote, contentType: "text/plain", finalUrl: "https://example.org/article", status: 200 });
  mocks.verify.mockReturnValue(true); mocks.records.mockReturnValue([]); mocks.fixtures.mockResolvedValue([]);
  mocks.reserve.mockReturnValue(true); mocks.duplicate.mockReturnValue(false); mocks.add.mockReturnValue("added");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("private evidence intake boundary", () => {
  it("does nothing when the flag is off or storage mode is unsupported", async () => {
    vi.stubEnv("ENABLE_EVIDENCE_INTAKE", undefined);
    expect((await POST(request())).status).toBe(404);
    vi.stubEnv("ENABLE_EVIDENCE_INTAKE", "true"); vi.stubEnv("DATA_MODE", undefined);
    expect((await POST(request())).status).toBe(501);
    expect(mocks.site).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, "{", { ...input, project_id: "costar-123" }, { ...input, source_url: "http://example.org" },
    { ...input, source_url: "https://user:pass@example.org" }, { ...input, source_url: "https://example.org:444" },
    { ...input, quote: "short" }, { ...input, quote: "x" + " ".repeat(40) }, { ...input, quote: "x".repeat(301) }, { ...input, publication_date: "2026-02-30" },
    { ...input, publication_date: "9999-01-01" }, { ...input, signal_type: "outcome_denied" }, { ...input, summary: "" },
    { ...input, summary: "x".repeat(1001) }, { ...input, effect: "raise" }])("rejects invalid input without fetching %j", async (body) => {
    expect((await POST(request(body))).status).toBe(422);
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("rejects cross-origin, wrong media type and excessive request bodies before fetching", async () => {
    for (const req of [request(input, { Origin: "https://attacker.example" }), request(input, { "Content-Type": "text/plain" }),
      request("x".repeat(17000)), request(input, { "Content-Length": "999999" })]) expect((await POST(req)).status).toBe(422);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("accepts a same-origin browser Host when Next uses an internal request hostname", async () => {
    expect((await POST(request(input, { Origin: "http://127.0.0.1:3100", Host: "127.0.0.1:3100" }))).status).toBe(201);
    expect((await POST(request(input, { Origin: "https://attacker.example", Host: "127.0.0.1:3100" }))).status).toBe(422);
  });
  it("validates project existence before fetching", async () => {
    mocks.site.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(422); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects tomorrow in Chicago even when UTC has already rolled over", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-15T01:30:00Z"));
    expect((await POST(request({ ...input, publication_date: "2026-11-15" }))).status).toBe(422);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect((await POST(request({ ...input, publication_date: "2026-11-14" }))).status).toBe(201);
  });
  it("counts attempts and refuses limits without a fetch", async () => {
    mocks.reserve.mockReturnValue(false);
    const res = await POST(request()); expect(res.status).toBe(429); expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.reserve).toHaveBeenCalledWith(visitor);
  });
  it("rejects fixture or session duplicates before fetching", async () => {
    mocks.duplicate.mockReturnValue(true);
    expect((await POST(request())).status).toBe(409); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["blocked_address", "invalid_url", "fetch_failed"] as const)("returns controlled fetch error %s", async (code) => {
    mocks.fetch.mockRejectedValue(new SafeFetchError(code, "sensitive upstream internals"));
    const res = await POST(request()); expect(res.status).toBe(code === "fetch_failed" ? 502 : 422);
    expect(JSON.stringify(await res.json())).not.toContain("sensitive"); expect(mocks.add).not.toHaveBeenCalled();
  });
  it("refuses unmatched quotes without storing and records failed attempts", async () => {
    mocks.verify.mockReturnValue(false);
    const res = await POST(request()); expect(res.status).toBe(422);
    expect((await res.json()).detail).toMatch(/quote/i); expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.reserve).toHaveBeenCalledOnce();
  });
  it("stores a context-only record with submission dates honestly attributed", async () => {
    const res = await POST(request()); expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.signal).toMatchObject({ entity_id: project, effect: "context", event_at: null, event_precision: "unknown",
      published_at: "2026-01-01", published_precision: "day", source_url: "https://example.org/article", source_name: "example.org",
      verification: { method: "verbatim_match", publication_date_basis: "submitter" } });
    expect(body.signal.verification.verified_at).toBe(body.signal.recorded_at);
    expect(mocks.add).toHaveBeenCalledWith(visitor, body.signal);
    expect(mocks.verify).toHaveBeenCalledWith(input.quote, input.quote, "text/plain");
  });
  it("checks the final redirected URL for duplicates too", async () => {
    mocks.duplicate.mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect((await POST(request())).status).toBe(409); expect(mocks.add).not.toHaveBeenCalled();
  });
  it.each([["duplicate", 409], ["store_full", 429]] as const)("handles an atomic store refusal %s", async (reason, code) => {
    mocks.add.mockReturnValue(reason); expect((await POST(request())).status).toBe(code);
  });
  it.each([undefined, { value: "bad-cookie" }])("sets a valid private visitor cookie, even on a failed attempt", async (cookie) => {
    mocks.cookieGet.mockReturnValue(cookie); mocks.verify.mockReturnValue(false);
    const res = await POST(request()); expect(res.status).toBe(422);
    expect(res.headers.get("set-cookie")).toMatch(/client_id=[a-f0-9-]{36}/);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly"); expect(res.headers.get("set-cookie")).toContain("SameSite=lax");
  });
  it("never leaks unexpected server errors", async () => {
    mocks.site.mockRejectedValue(new Error("private path"));
    const res = await POST(request()); expect(res.status).toBe(502); expect(JSON.stringify(await res.json())).not.toContain("private path");
  });
});
