import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createDbQuery, syntheticProjects } from "@/test/dbFixtures";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }));
vi.mock("@/app/evidence/EvidenceMap", () => ({ default: () => null }));
import EvidencePage from "./page";

const oldMode = process.env.DATA_MODE;
afterAll(() => { if (oldMode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = oldMode; });
beforeEach(() => {
  delete process.env.DATA_MODE;
  mocks.query.mockReset().mockImplementation(createDbQuery());
});

describe("database-mode evidence page", () => {
  it("renders model metrics, the label spot check, case table, and the mocked stopped-project list", async () => {
    const html = renderToStaticMarkup(await EvidencePage());
    expect(html).toContain("The evidence behind every score");
    expect(html).toContain("ROC AUC (cross-validated)");
    expect(html).toContain("0.70 ± 0.15");
    expect(html).toContain("Training label check");
    expect(html).toContain("4 of 16 stopped training labels reviewed");
    expect(html).toContain("3 consistent in outcome kind");
    expect(html).toContain("1 consistent in date");
    expect(html).toContain("How the evidence rule behaved on recorded cases");
    expect(html).toContain("County context only");
    const caseRows = html.split(/(?=<tr\b)/);
    const stoppedCase = caseRows.find((row) => row.includes(`/sites/${syntheticProjects[0].project_id}#evidence-timeline`));
    const proposedCase = caseRows.find((row) => row.includes(`/sites/${syntheticProjects[1].project_id}#evidence-timeline`));
    expect(stoppedCase).toContain("Watch");
    expect(proposedCase).toContain("Low risk");
    expect(html).toContain("Projects the tracker lists as stopped");
    expect(html).toContain(syntheticProjects[0].name);
    expect(html).not.toContain(syntheticProjects[2].name);
    expect(html).toContain("Tracker label: defeated");
    expect(html).toContain("Watch");
    expect(mocks.query.mock.calls).toHaveLength(2);
    for (const [sql, args] of mocks.query.mock.calls) {
      expect(sql).not.toContain(syntheticProjects[0].project_id);
      expect(args).toEqual([]);
    }
  });
});
