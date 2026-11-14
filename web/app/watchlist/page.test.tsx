import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createDbQuery, syntheticListings, syntheticProjects, syntheticWatchlist, SYNTHETIC_CLIENT_ID } from "@/test/dbFixtures";

const mocks = vi.hoisted(() => ({ query: vi.fn(), cookie: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
import WatchlistPage from "./page";

const oldMode = process.env.DATA_MODE;
afterAll(() => { if (oldMode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = oldMode; });
beforeEach(() => {
  delete process.env.DATA_MODE;
  mocks.query.mockReset().mockImplementation(createDbQuery());
  mocks.cookie.mockReset().mockReturnValue({ value: SYNTHETIC_CLIENT_ID });
});

describe("database-mode watchlist page", () => {
  it("renders mixed listing and project rows from Date-valued saved times with a county change feed", async () => {
    expect(syntheticWatchlist.every((entry) => entry.added_at instanceof Date)).toBe(true);
    const html = renderToStaticMarkup(await WatchlistPage({ searchParams: Promise.resolve({ mw: "100", since: "2026-02-15" }) }));
    expect(html).toContain(syntheticListings[0].name);
    expect(html).toContain(syntheticProjects[0].name);
    expect(html).toContain(`/listings/${syntheticListings[0].site_id}?mw=100`);
    expect(html).toContain(`/sites/${syntheticProjects[0].project_id}?mw=100`);
    expect(html).toContain("39/100");
    expect(html).toContain("59/100");
    const tableRows = html.slice(html.indexOf("<table")).split(/(?=<tr\b)/);
    const listingRow = tableRows.find((row) => row.includes(`/listings/${syntheticListings[0].site_id}`));
    const projectRow = tableRows.find((row) => row.includes(`/sites/${syntheticProjects[0].project_id}`));
    expect(listingRow).toContain("39/100");
    expect(listingRow).toContain("Low risk");
    expect(projectRow).toContain("59/100");
    expect(projectRow).toContain("Watch");
    expect(html).toContain("Replay of retrospectively assembled records");
    expect(html).toContain("County-wide: Hays County");
    expect(html).toContain("Moratorium proposed");
    expect(html).toContain("Published 2026-02-16");
    expect(mocks.query.mock.calls.some(([sql, args]) => sql.includes("site_watchlist") && args.includes(SYNTHETIC_CLIENT_ID))).toBe(true);
    for (const [sql, args] of mocks.query.mock.calls) {
      expect(sql).not.toContain(SYNTHETIC_CLIENT_ID);
      expect(sql).not.toContain(syntheticListings[0].site_id);
      expect(sql).not.toContain(syntheticProjects[0].project_id);
      expect(Array.isArray(args)).toBe(true);
      if (sql.includes("site_watchlist")) expect(args).toContain(SYNTHETIC_CLIENT_ID);
      else if (sql.includes("FROM sites")) expect(args[0]).toContain(syntheticListings[0].site_id);
      else if (sql.includes("FROM tx_projects")) expect(args[0]).toContain(syntheticProjects[0].project_id);
    }
  });

  it("shows the live feed for records added after saving the project", async () => {
    const html = renderToStaticMarkup(await WatchlistPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Newly recorded source signals for your saved projects");
    expect(html).toContain("County-wide: Hays County");
    expect(html).not.toContain("No new records since you saved these sites");
  });
});
