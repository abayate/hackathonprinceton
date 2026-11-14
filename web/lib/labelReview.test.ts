import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseCsv } from "./publicData";
import { getLabelReviews, parseLabelReviews, summarizeLabelReviews } from "./labelReview";

const fixture = JSON.parse(fs.readFileSync(new URL("../../data/signals/label_review.json", import.meta.url), "utf8"));
const csv = parseCsv(fs.readFileSync(new URL("../../data/labels/tx_projects.csv", import.meta.url), "utf8"));
const sourceRows = parseCsv(fs.readFileSync(new URL("../../data/sources.csv", import.meta.url), "utf8"));
const signals = JSON.parse(fs.readFileSync(new URL("../../data/signals/risk_signals.json", import.meta.url), "utf8")) as { signal_id: string; source_url: string }[];
const sourceDocument = fs.readFileSync(new URL("../../docs/EVIDENCE_SOURCES.md", import.meta.url), "utf8");

describe("retrospective tracker label reviews", () => {
  it("pins four conservative findings and the pure summary", () => {
    const rows = parseLabelReviews(fixture);
    expect(rows.map((row) => [row.project_id, row.kind_finding, row.date_finding])).toEqual([
      ["1c23acb7-4ec3-459b-aa99-1bd3104a4fb9", "consistent", "consistent"],
      ["4f2eaf6e-61e0-4721-8ac1-8f12718c64c8", "consistent", "not_established"],
      ["36a8e10f-045d-47b7-8e64-0319d509ce45", "consistent", "differs"],
      ["53035780-aaef-4edb-b279-eb8e2b5cc470", "not_established", "not_established"],
    ]);
    expect(rows.map((row) => [row.signal_ids, row.source_ids])).toEqual([
      [["san-marcos-map-amendment-denied-2026-02"], ["R04"]],
      [["tomahawk-proposal-withdrawn-2026-09"], ["R08", "R16"]],
      [["matrix-construction-suspended-2026-01"], ["R05", "R14"]],
      [["athens-resident-opposition-2026-04", "athens-city-ordinance-enacted-2026-08"], ["R09", "R13"]],
    ]);
    expect(summarizeLabelReviews(rows)).toEqual({ reviewed: 4, consistentKind: 3, consistentDate: 1 });
    const before = JSON.stringify(rows);
    expect(summarizeLabelReviews(rows.slice(0, 1))).toEqual({ reviewed: 1, consistentKind: 1, consistentDate: 1 });
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("pins tracker fields to the committed CSV and every citation to an existing source", () => {
    const rows = parseLabelReviews(fixture);
    const projects = new Map(csv.map((row) => [row.project_id, row]));
    const registry = new Map(sourceRows.map((row) => [row.source_id, row]));
    const knownSignals = new Map(signals.map((signal) => [signal.signal_id, signal]));
    for (const row of rows) {
      const project = projects.get(row.project_id);
      expect(project?.label, row.project_id).toBe("stopped");
      expect(project?.use_for_training, row.project_id).toBe("yes");
      expect([row.tracker_status, row.tracker_stop_date]).toEqual([project?.tracker_status, project?.stop_event_date]);
      expect(row.signal_ids.length + row.source_ids.length).toBeGreaterThan(0);
      for (const id of row.signal_ids) expect(knownSignals.has(id), id).toBe(true);
      for (const id of row.source_ids) {
        const source = registry.get(id);
        expect(source, id).toBeDefined();
        expect(sourceDocument.includes(source!.url) || signals.some((signal) => signal.source_url === source!.url), id).toBe(true);
      }
    }
    expect(new Set(rows.map((row) => row.project_id)).size).toBe(4);
  });

  it("loads a validated copy from the server-only public review fixture", async () => {
    const rows = await getLabelReviews();
    expect(rows).toEqual(parseLabelReviews(fixture));
  });

  it("rejects malformed, duplicate, and unsupported review records", () => {
    const good = fixture[0];
    for (const bad of [null, {}, [null], [{ ...good, project_id: "bad" }],
      [{ ...good, tracker_stop_date: "2026-02-30" }], [{ ...good, kind_finding: "verified" }],
      [{ ...good, note: "" }], [{ ...good, source_ids: ["private-key"] }],
      [{ ...good, signal_ids: ["not an id"] }], [{ ...good, source_ids: ["R04", "R04"] }],
      [{ ...good, surprise: "extra" }], [good, good]]) {
      expect(() => parseLabelReviews(bad)).toThrow(/Invalid label review|Duplicate label review/);
    }
  });
});
