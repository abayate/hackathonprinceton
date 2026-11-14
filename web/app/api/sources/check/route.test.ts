import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { SafeFetchError } from "@/lib/safeFetch";
import { applyCheck } from "@/lib/sourceMonitor";
import type { SourceCheck, WatchedSource } from "@/lib/sourceMonitorTypes";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ site: vi.fn(), signals: vi.fn(), watched: vi.fn(), paragraphs: vi.fn(), fetchPage: vi.fn() }));
vi.mock("@/lib/publicStore", () => ({ getPublicSite: mocks.site }));
vi.mock("@/lib/signalStore", () => ({ getSignals: mocks.signals }));
vi.mock("@/lib/sourceMonitor", async (original) => ({ ...await original<object>(),
  watchedSourcesFor: mocks.watched, toParagraphs: mocks.paragraphs }));
vi.mock("@/lib/safeFetch", async (original) => ({ ...await original<object>(), fetchPublicText: mocks.fetchPage }));

const projectId = "11111111-1111-4111-8111-111111111111";
const url = "https://example.org/project";
const source: WatchedSource = { id: `${projectId}:0123456789abcdef`, projectId, url,
  label: "Project source", kind: "primary", publishedAt: null };
const headers = { "Content-Type": "application/json", Origin: "http://localhost" };
const request = (body: unknown = { projectId }, extraHeaders: HeadersInit = {}) => new Request("http://localhost/api/sources/check", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { ...headers, ...extraHeaders },
});
let POST: typeof import("./route").POST;

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); vi.stubEnv("DATA_MODE", "public");
  POST = (await import("./route")).POST;
  mocks.site.mockImplementation(async (id: string) => ({ project_id: id }));
  mocks.signals.mockResolvedValue([]);
  mocks.watched.mockImplementation((site: { project_id: string }) => [{ ...source,
    id: `${site.project_id}:0123456789abcdef`, projectId: site.project_id }]);
  mocks.paragraphs.mockReturnValue([{ hash: "fedcba9876543210", text: "A newly published project paragraph with more than sixty characters of meaningful text." }]);
  mocks.fetchPage.mockResolvedValue({ text: "page", contentType: "text/html", finalUrl: url, status: 200 });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Direct network access forbidden in tests")));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("checks a public project in database mode using only its derived public sources", async () => {
  vi.stubEnv("DATA_MODE", undefined);
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.site).toHaveBeenCalledWith(projectId);
  expect(mocks.signals).toHaveBeenCalledOnce();
  expect(mocks.watched).toHaveBeenCalledWith({ project_id: projectId }, []);
  expect(mocks.fetchPage).toHaveBeenCalledOnce();
  expect(mocks.fetchPage).toHaveBeenCalledWith(url);
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects a property UUID that is absent from the checked-in public projects in database mode", async () => {
  vi.stubEnv("DATA_MODE", undefined);
  mocks.site.mockResolvedValueOnce(null);
  const propertyId = "22222222-2222-4222-8222-222222222222";
  const response = await POST(request({ projectId: propertyId }));
  expect(response.status).toBe(422);
  expect(mocks.site).toHaveBeenCalledWith(propertyId);
  expect(mocks.signals).not.toHaveBeenCalled();
  expect(mocks.watched).not.toHaveBeenCalled();
  expect(mocks.fetchPage).not.toHaveBeenCalled();
});

it("rejects forged URLs, extra keys, wrong origins and oversized bodies before project lookup", async () => {
  const cases = [
    request({ projectId, url: "https://attacker.example/" }),
    request({ projectId, sources: ["https://attacker.example/"] }),
    request({ projectId: "bad" }),
    request({ projectId: "costar-900001" }),
    request("{bad"),
    request({ projectId }, { Origin: "https://attacker.example" }),
    request({ projectId }, { Origin: "" }),
    new Request("https://localhost/api/sources/check", { method: "POST", body: JSON.stringify({ projectId }), headers }),
    request({ projectId }, { "Content-Type": "text/plain" }),
    request(" ".repeat(1_025)),
  ];
  for (const req of cases) expect((await POST(req)).status).toBe(422);
  expect(mocks.site).not.toHaveBeenCalled(); expect(mocks.fetchPage).not.toHaveBeenCalled();
});

it("rejects an unknown public project without fetching", async () => {
  mocks.site.mockResolvedValueOnce(null);
  const response = await POST(request());
  expect(response.status).toBe(422);
  expect(mocks.watched).not.toHaveBeenCalled(); expect(mocks.fetchPage).not.toHaveBeenCalled();
});

it("fetches only derived project sources and returns bounded paragraph checks", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ projectId, checks: [{ sourceId: source.id,
    fetchedAt: expect.any(String), outcome: "ok", paragraphs: mocks.paragraphs.mock.results[0].value }] });
  expect(mocks.fetchPage).toHaveBeenCalledOnce();
  expect(mocks.fetchPage).toHaveBeenCalledWith(url);
  expect(fetch).not.toHaveBeenCalled();
});

it("marks HTTP failures unreachable and a known unsupported MIME response not_text", async () => {
  mocks.watched.mockReturnValue([source, { ...source, id: `${projectId}:2222222222222222`, url: "https://example.org/other" }]);
  mocks.fetchPage.mockRejectedValueOnce(new SafeFetchError("fetch_failed", "Source page returned an error", 503))
    .mockRejectedValueOnce(new SafeFetchError("fetch_failed", "Source page must be text or HTML", 200));
  const response = await POST(request());
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.checks.map((check: { outcome: string; paragraphs: unknown[] }) => [check.outcome, check.paragraphs]))
    .toEqual([["unreachable", []], ["not_text", []]]);
});

it("marks an unreadable text response not_text instead of establishing an empty baseline", async () => {
  mocks.paragraphs.mockReturnValueOnce([]);
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect((await response.json()).checks).toMatchObject([{ outcome: "not_text", paragraphs: [] }]);
});

it("enforces a global three-run outbound ceiling with a useful retry response", async () => {
  const releases: ((value: { text: string; contentType: string; finalUrl: string; status: number }) => void)[] = [];
  mocks.fetchPage.mockImplementation(() => new Promise((resolve) => { releases.push(resolve); }));
  const ids = [1, 2, 3, 4].map((n) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`);
  const running = ids.slice(0, 3).map((id) => POST(request({ projectId: id })));
  await vi.waitFor(() => expect(mocks.fetchPage).toHaveBeenCalledTimes(3));
  const blocked = await POST(request({ projectId: ids[3] }));
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("retry-after")).toBeTruthy();
  expect((await blocked.json()).detail).toMatch(/try again/i);
  for (const release of releases) release({ text: "page", contentType: "text/plain", finalUrl: url, status: 200 });
  await Promise.all(running);
});

it("applies a short project cooldown before a repeated outbound check", async () => {
  expect((await POST(request())).status).toBe(200);
  const again = await POST(request());
  expect(again.status).toBe(429);
  expect(again.headers.get("retry-after")).toBeTruthy();
  expect(mocks.fetchPage).toHaveBeenCalledOnce();
});

it("delivers changed paragraphs and an unreachable retry without losing the last good snapshot", async () => {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const first = (await (await POST(request())).json()).checks[0] as SourceCheck;
  const baseline = applyCheck(null, first, ["Project"], source);
  expect(baseline.status).toBe("baseline");

  now += 2_000;
  const newParagraph = { hash: "aaaaaaaaaaaaaaaa", text: "The Project has filed a new public notice with a meaningful paragraph." };
  mocks.paragraphs.mockReturnValueOnce([newParagraph]);
  const changed = (await (await POST(request())).json()).checks[0] as SourceCheck;
  const reviewed = applyCheck(baseline.snapshot, changed, ["Project"], source);
  expect(reviewed.status).toBe("new_text");
  expect(reviewed.snapshot.pending).toMatchObject([{ hash: newParagraph.hash, mentions: ["Project"] }]);

  now += 2_000;
  mocks.fetchPage.mockRejectedValueOnce(new SafeFetchError("fetch_failed", "Source page returned an error", 503));
  const unavailable = (await (await POST(request())).json()).checks[0] as SourceCheck;
  const retained = applyCheck(reviewed.snapshot, unavailable, ["Project"], source);
  expect(retained.status).toBe("unreachable");
  expect(retained.snapshot.lastOkAt).toBe(reviewed.snapshot.lastOkAt);
  expect(retained.snapshot.pending).toEqual(reviewed.snapshot.pending);
});

it("caps derived sources and refuses a new run before the process fetch budget is exceeded", async () => {
  const sources = Array.from({ length: 9 }, (_, i) => ({ ...source,
    id: `${projectId}:${String(i).padStart(16, "0")}`, url: `https://example.org/${i}` }));
  mocks.watched.mockImplementation((site: { project_id: string }) => sources.map((item) => ({ ...item,
    id: `${site.project_id}:${item.id.slice(-16)}`, projectId: site.project_id })));
  const ids = Array.from({ length: 8 }, (_, index) =>
    `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`);
  for (const id of ids.slice(0, 7)) expect((await POST(request({ projectId: id }))).status).toBe(200);
  expect(mocks.fetchPage).toHaveBeenCalledTimes(56);
  const limited = await POST(request({ projectId: ids[7] }));
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBeTruthy();
  expect(mocks.fetchPage).toHaveBeenCalledTimes(56);
});
