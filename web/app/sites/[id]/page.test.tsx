import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createDbQuery, syntheticProjects, SYNTHETIC_CLIENT_ID } from "@/test/dbFixtures";

const mocks = vi.hoisted(() => ({ query: vi.fn(), cookie: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock("@/app/components/SiteMap", () => ({ default: () => null }));
import SitePage from "./page";

const oldMode = process.env.DATA_MODE;
afterAll(() => { if (oldMode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = oldMode; });
beforeEach(() => {
  delete process.env.DATA_MODE;
  mocks.query.mockReset().mockImplementation(createDbQuery());
  mocks.cookie.mockReset().mockReturnValue({ value: SYNTHETIC_CLIENT_ID });
});

function page(id: string, asof?: string) {
  return SitePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ mw: "100", asof }) });
}

describe("database-mode project page", () => {
  it("renders scored history, an in-sample note, attributed tracker status, and real Hays County context", async () => {
    const id = syntheticProjects[0].project_id;
    const html = renderToStaticMarkup(await page(id, "2026-02-16"));
    expect(html).toContain("Synthetic Project Stopped");
    expect(html).toContain("Risk score 59/100");
    expect(html).toContain("Watch");
    expect(html).toContain("2026-09-01 10:00");
    expect(html).toContain("2026-10-02 12:00");
    const historyRows = html.split(/(?=<li\b)/);
    const firstHistory = historyRows.find((row) => row.includes("2026-09-01 10:00"));
    const secondHistory = historyRows.find((row) => row.includes("2026-10-02 12:00"));
    expect(firstHistory).toContain("Risk score 39/100");
    expect(firstHistory).toContain("Low risk");
    expect(secondHistory).toContain("Risk score 59/100");
    expect(secondHistory).toContain("Watch");
    expect(html).toContain("Recorded scores from different model versions may not be directly comparable");
    expect(html).toContain("score here is in-sample");
    expect(html).toContain("Tracker status");
    expect(html).toContain("The tracker lists this project as defeated");
    expect(html).toContain("has not been independently verified");
    expect(html).toContain("County-wide: Hays County");
    expect(html).toContain("Moratorium proposed");
    expect(html).toContain("Context only; does not raise the evidence level");
    expect(html).toContain("Showing 1 of 1 records");
    expect(mocks.query.mock.calls.length).toBeGreaterThan(2);
    for (const [sql, args] of mocks.query.mock.calls) {
      expect(sql).not.toContain(id);
      expect(Array.isArray(args)).toBe(true);
      expect(args).toContain(sql.includes("site_watchlist") ? SYNTHETIC_CLIENT_ID : id);
    }
  });

  it("takes an unknown ID through notFound while keeping the ID out of SQL text", async () => {
    const id = "90000000-0000-4000-8000-000000009999";
    await expect(page(id)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.query.mock.calls.some(([sql, args]) => !sql.includes(id) && args.includes(id))).toBe(true);
  });

  it("rejects a history query that stops selecting the score used by the page", async () => {
    await page(syntheticProjects[0].project_id);
    const history = mocks.query.mock.calls.find(([sql]) => sql.includes("FROM risk_scores WHERE project_id = $1"));
    expect(history).toBeDefined();
    const [sql, args] = history as [string, unknown[]];
    const missingScore = sql.replace(/,\s*p_stopped\s*,/, ",");
    expect(missingScore).not.toBe(sql);
    await expect(createDbQuery()(missingScore, args)).rejects.toThrow("Unexpected synthetic DB selected columns");
  });
});
