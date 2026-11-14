import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), listPublicSites: vi.fn(), getPublicSite: vi.fn(), getPublicSites: vi.fn(),
  publicScoreHistory: vi.fn(), saferPublicNearby: vi.fn(), publicWatchlistIds: vi.fn(), publicWatchlistEntries: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ pool: { query: mocks.query } }));
vi.mock("./publicStore", () => ({
  listPublicSites: mocks.listPublicSites,
  getPublicSite: mocks.getPublicSite,
  getPublicSites: mocks.getPublicSites,
  publicScoreHistory: mocks.publicScoreHistory,
  saferPublicNearby: mocks.saferPublicNearby,
  publicWatchlistIds: mocks.publicWatchlistIds,
  publicWatchlistEntries: mocks.publicWatchlistEntries,
}));
import { getSite, getSites, listSites, saferNearby, scoreHistory, watchlistEntries, watchlistIds } from "./sites";

const clientId = "04c5d573-d357-476f-9ef7-99980f476023";

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("DATA_MODE", "public"); });
afterEach(() => vi.unstubAllEnvs());

it("delegates every site read to public data without querying the database", async () => {
  mocks.listPublicSites.mockResolvedValue([]);
  mocks.getPublicSite.mockResolvedValue(null);
  mocks.getPublicSites.mockResolvedValue([]);
  mocks.publicScoreHistory.mockResolvedValue([]);
  mocks.saferPublicNearby.mockResolvedValue([]);
  mocks.publicWatchlistIds.mockResolvedValue([]);
  mocks.publicWatchlistEntries.mockResolvedValue([]);

  const filters = { status: "stopped" };
  await listSites(filters);
  await getSite("one");
  await getSites(["one"]);
  await scoreHistory("one");
  await saferNearby("one", 2);
  await watchlistIds(clientId);
  await watchlistEntries(clientId);

  expect(mocks.listPublicSites).toHaveBeenCalledWith(filters);
  expect(mocks.getPublicSite).toHaveBeenCalledWith("one");
  expect(mocks.getPublicSites).toHaveBeenCalledWith(["one"]);
  expect(mocks.publicScoreHistory).toHaveBeenCalledWith("one");
  expect(mocks.saferPublicNearby).toHaveBeenCalledWith("one", 2);
  expect(mocks.publicWatchlistIds).toHaveBeenCalledWith(clientId);
  expect(mocks.publicWatchlistEntries).toHaveBeenCalledWith(clientId);
  expect(mocks.query).not.toHaveBeenCalled();
});

it("rejects invalid visitor cookies before either store can be read", async () => {
  expect(await watchlistIds("not-a-uuid")).toEqual([]);
  expect(await watchlistEntries("not-a-uuid")).toEqual([]);
  vi.stubEnv("DATA_MODE", undefined);
  expect(await watchlistIds("not-a-uuid")).toEqual([]);
  expect(await watchlistEntries("not-a-uuid")).toEqual([]);
  expect(mocks.publicWatchlistIds).not.toHaveBeenCalled();
  expect(mocks.publicWatchlistEntries).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});

it("normalizes database saved timestamps and derives IDs in the same order", async () => {
  vi.stubEnv("DATA_MODE", undefined);
  mocks.query.mockResolvedValue({ rows: [
    { project_id: "one", added_at: new Date("2025-08-20T15:30:00.000Z") },
    { project_id: "two", added_at: "2025-08-01T12:00:00.000Z" },
  ] });
  expect(await watchlistEntries(clientId)).toEqual([
    { project_id: "one", added_at: "2025-08-20T15:30:00.000Z" },
    { project_id: "two", added_at: "2025-08-01T12:00:00.000Z" },
  ]);
  expect(await watchlistIds(clientId)).toEqual(["one", "two"]);
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("ORDER BY added_at DESC"), [clientId]);
  expect(mocks.query).toHaveBeenCalledTimes(2);
});

it("uses the shared bounded water filter in database mode", async () => {
  vi.stubEnv("DATA_MODE", undefined);
  mocks.query.mockResolvedValue({ rows: [] });
  await listSites({ water: "not-a-number" });
  expect(mocks.query).toHaveBeenLastCalledWith(expect.not.stringContaining("water_stress_score <="), []);
  await listSites({ water: "6" });
  expect(mocks.query).toHaveBeenLastCalledWith(expect.not.stringContaining("water_stress_score <="), []);
  await listSites({ water: "0" });
  expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining("water_stress_score <= $1"), [0]);
});

it("keeps database listing filters parameterized and applies the band filter", async () => {
  vi.stubEnv("DATA_MODE", undefined);
  mocks.query.mockResolvedValue({ rows: [
    { project_id: "low", p_stopped: 0.2 },
    { project_id: "high", p_stopped: 0.8 },
  ] });
  const result = await listSites({ status: "built", q: "O'Hare", water: "3", sort: "name", band: "red" });
  expect(result.map((s) => s.project_id)).toEqual(["high"]);
  expect(mocks.query).toHaveBeenCalledWith(
    expect.stringMatching(/p\.label = 'built'[\s\S]*p\.name ILIKE \$1[\s\S]*water_stress_score <= \$2[\s\S]*ORDER BY p\.name/),
    ["%O'Hare%", 3],
  );
});

it("reads single and multiple database projects without changing requested order", async () => {
  vi.stubEnv("DATA_MODE", undefined);
  mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ project_id: "one", p_stopped: 0.4 }] })
    .mockResolvedValueOnce({ rows: [{ project_id: "two", p_stopped: 0.8 }, { project_id: "one", p_stopped: 0.4 }] });
  expect(await getSite("missing")).toBeNull();
  expect(await getSite("one")).toMatchObject({ project_id: "one", band: "watch" });
  expect(await getSites([])).toEqual([]);
  expect((await getSites(["one", "missing", "two"])).map((s) => s.project_id)).toEqual(["one", "two"]);
  expect(mocks.query).toHaveBeenCalledTimes(3);
  expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining("ANY($1)"), [["one", "missing", "two"]]);
});

it("reads database score history and lower-risk nearby projects", async () => {
  vi.stubEnv("DATA_MODE", undefined);
  const history = [{ at: "2025-08-01 12:00", p_stopped: 0.5, model_version: "v1" }];
  mocks.query.mockResolvedValueOnce({ rows: history }).mockResolvedValueOnce({ rows: [
    { project_id: "near", p_stopped: 0.1, km: 2.2 },
  ] });
  expect(await scoreHistory("one")).toEqual(history);
  expect(await saferNearby("one", 2)).toMatchObject([{ project_id: "near", km: 2.2, band: "green" }]);
  expect(mocks.query).toHaveBeenNthCalledWith(1, expect.stringContaining("FROM risk_scores WHERE project_id = $1"), ["one"]);
  expect(mocks.query).toHaveBeenNthCalledWith(2, expect.stringContaining("LIMIT $2"), ["one", 2]);
});

it("propagates database failure with DATA_MODE unset", async () => {
  vi.stubEnv("DATA_MODE", undefined);
  mocks.query.mockRejectedValue(new Error("DATABASE_URL is not set"));
  await expect(getSite("one")).rejects.toThrow("DATABASE_URL is not set");
  expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(mocks.getPublicSite).not.toHaveBeenCalled();
});
