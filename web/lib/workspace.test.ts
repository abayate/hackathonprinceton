import { describe, expect, it } from "vitest";
import type { Site } from "./sites";
import type { Signal } from "./signals";
import type { Candidate, WorkspaceBrief, WorkspaceState } from "./workspaceTypes";
import { parseState, shortlist, tasksFor, toCandidate } from "./workspace";

const ID_A = "90000000-0000-4000-8000-000000000001";
const ID_B = "90000000-0000-4000-8000-000000000002";
const ID_C = "90000000-0000-4000-8000-000000000003";

const site: Site = {
  project_id: ID_A, name: "Alpha Proposal", company: null, county: "Hays County", lat: 30, lng: -98,
  coord_precision: "town", capacity_mw: null, land_acres: null, tracker_status: "proposed", label: "unlabeled",
  stop_event_date: null, primary_source_url: "https://example.com/primary", primary_source_name: "Primary report",
  tracker_url: "https://example.com/tracker", city: "San Marcos city", in_city_limits: true, in_urban_area: true,
  county_density_per_sqmi: 100, nearest_metro: "Austin", km_to_nearest_metro: 25, is_crypto: false,
  county_tracked_projects: 2, water_stress_score: 1.4, water_stress_label: "Low - Medium", location_reliable: true,
  p_stopped: 0.45, in_training_set: false, model_version: "test", scored_at: "2026-11-14T00:00:00Z", band: "watch",
};

const signal: Signal = {
  signal_id: "synthetic-record", scope: "project", entity_id: ID_A, check_id: "zoning",
  signal_type: "approval_failed", effect: "raise", event_at: "2026-01-01", event_precision: "day",
  published_at: "2026-01-02", published_precision: "day", recorded_at: "2026-01-03T12:00:00Z",
  source_name: "Primary report", source_url: "https://example.com/primary", quote: "A synthetic quote",
  summary: "A synthetic report", verification: {
    method: "manual_review", verified_at: "2026-01-03T12:00:00Z", publication_date_basis: "source_page",
  },
};

function candidate(id: string, name: string, patch: Partial<Candidate> = {}): Candidate {
  return { ...toCandidate({ ...site, project_id: id, name }, []), ...patch };
}
const brief: WorkspaceBrief = { metro: null, county: null, mw: 100, criterion: "water_stress" };

describe("pure workspace engine", () => {
  it("builds a candidate with seven checks, matching dated records, and only safe unique sources", () => {
    const countySignal: Signal = {
      signal_id: "county-record", scope: "county", county: "Hays County", state: "TX", check_id: "zoning",
      signal_type: "moratorium_proposed", effect: "context", event_at: "2026-01-01", event_precision: "day",
      published_at: "2026-01-02", published_precision: "day", recorded_at: "2026-01-03T12:00:00Z",
      source_name: "County source", source_url: "https://example.com/county", quote: "A synthetic county quote",
      summary: "A synthetic county report", verification: {
        method: "manual_review", verified_at: "2026-01-03T12:00:00Z", publication_date_basis: "source_page",
      },
    };
    const unrelated: Signal = { ...signal, signal_id: "other-record", entity_id: ID_B,
      source_url: "https://example.com/unrelated" };
    const result = toCandidate({ ...site, tracker_url: "javascript:alert(1)" }, [signal, countySignal, unrelated]);
    expect(result.checks).toHaveLength(7);
    expect(result.recordCount).toBe(2);
    expect(result.datedRecords.map((r) => r.scope)).toEqual(["project", "county"]);
    expect(result.datedRecords.map((r) => r.url)).toEqual(["https://example.com/primary", "https://example.com/county"]);
    expect(result.sources.map((s) => s.url)).toContain("https://example.com/primary");
    expect(result.sources.map((s) => s.url)).toContain("https://example.com/county");
    expect(result.sources.map((s) => s.url)).toContain("/evidence");
    expect(result.sources.map((s) => s.url)).not.toContain("javascript:alert(1)");
    expect(result.sources.map((s) => s.url)).not.toContain("https://example.com/unrelated");
    expect(result.sources.filter((s) => s.url === "https://example.com/primary")).toHaveLength(1);
  });

  it("normalizes nonfinite candidate numbers to null", () => {
    const result = toCandidate({ ...site, capacity_mw: NaN, land_acres: Infinity,
      water_stress_score: NaN, km_to_nearest_metro: Infinity, p_stopped: NaN }, []);
    expect([result.capacityMw, result.landAcres, result.waterStressScore, result.kmToMetro, result.pStopped]).toEqual([null, null, null, null, null]);
  });

  it("filters exact county and sorts missing water data last with stable name/id ties", () => {
    const all = [candidate(ID_C, "Same", { waterStressScore: null }),
      candidate("90000000-0000-4000-8000-000000000005", "After", { waterStressScore: null }),
      candidate(ID_B, "Same", { waterStressScore: 1 }), candidate(ID_A, "Same", { waterStressScore: 1 }),
      candidate("90000000-0000-4000-8000-000000000004", "Elsewhere", { county: "Travis County", waterStressScore: 0 })];
    const rows = shortlist(all, { ...brief, county: "Hays County" });
    expect(rows.map((r) => r.candidate.id)).toEqual([ID_A, ID_B, "90000000-0000-4000-8000-000000000005", ID_C]);
    expect(rows.map((r) => r.sortValue)).toEqual([1, 1, null, null]);
    expect(rows[0].included.join(" ")).toContain("Hays County");
    expect(rows[2].missing.join(" ")).toContain("water stress");
    expect(rows[0].missing.join(" ")).not.toContain("land acreage");
  });

  it("uses distance only for the selected nearest metro and treats MW as a scenario for other sorts", () => {
    const all = [candidate(ID_A, "Alpha", { nearestMetro: "Austin", kmToMetro: 40, capacityMw: 20 }),
      candidate(ID_B, "Bravo", { nearestMetro: "Dallas", kmToMetro: 1, capacityMw: 200 }),
      candidate(ID_C, "Charlie", { nearestMetro: "Austin", kmToMetro: null, capacityMw: null })];
    const rows = shortlist(all, { ...brief, metro: "Austin", mw: 100, criterion: "metro_distance" });
    expect(rows.map((r) => r.candidate.id)).toEqual([ID_A, ID_C]);
    expect(rows[0].sortValue).toBe(40);
    expect(rows[0].included.join(" ")).toContain("Austin");
    expect(rows[0].missing.join(" ")).not.toContain("20 MW");
    expect(rows[1].sortValue).toBeNull();
  });

  it("excludes only known capacity below target in reported-MW mode, retaining unknowns last", () => {
    const all = [candidate(ID_A, "Small", { capacityMw: 80 }), candidate(ID_B, "Unknown", { capacityMw: null }),
      candidate(ID_C, "Large", { capacityMw: 150 }), candidate("90000000-0000-4000-8000-000000000004", "Fit", { capacityMw: 100 })];
    const rows = shortlist(all, { ...brief, criterion: "reported_mw", mw: 100 });
    expect(rows.map((r) => r.candidate.name)).toEqual(["Fit", "Large", "Unknown"]);
    expect(rows.map((r) => r.sortValue)).toEqual([100, 150, null]);
    expect(rows[0].included.join(" ")).toContain("100 MW");
    expect(rows[2].missing.join(" ")).toContain("capacity");
  });

  it("generates stable tasks for unknown checks, missing fields, dated records and unverified assumptions", () => {
    const c = toCandidate({ ...site, location_reliable: false }, [signal]);
    const first = tasksFor(c);
    expect(tasksFor(c)).toEqual(first);
    expect(new Set(first.map((t) => t.id)).size).toBe(first.length);
    expect(first.every((t) => t.projectId === ID_A && !t.done)).toBe(true);
    expect(first.some((t) => t.origin === "unknown_check" && t.checkId === "labor")).toBe(true);
    expect(first.some((t) => t.origin === "missing_field" && /capacity/i.test(t.text))).toBe(true);
    expect(first.some((t) => t.id.endsWith(":field:acres"))).toBe(false);
    expect(first.some((t) => /acreage/i.test(t.text) && /flood.*terrain/i.test(t.text))).toBe(true);
    expect(first.some((t) => t.origin === "missing_field" && /location/i.test(t.text))).toBe(true);
    expect(first.some((t) => t.origin === "dated_record")).toBe(true);
    expect(first.some((t) => /time to connect/i.test(t.text))).toBe(true);
    expect(first.some((t) => /water supply and rights/i.test(t.text))).toBe(true);
    expect(first.some((t) => /flood.*terrain/i.test(t.text))).toBe(true);
    expect(first.some((t) => /zoning.*permit approval/i.test(t.text))).toBe(true);
  });

  it("accepts bounded state while retaining notes and decisions for valid deselected IDs", () => {
    const state: WorkspaceState = {
      version: 1, brief, selectedIds: [ID_A, ID_B], decisions: { [ID_C]: "hold" },
      notes: { [ID_C]: "Research later" }, tasks: [{ id: `${ID_A}:user:one`, projectId: ID_A,
        checkId: null, text: "Ask utility", origin: "user", done: false }], updatedAt: "2026-11-14T12:00:00.000Z",
    };
    expect(parseState(state)).toEqual(state);
    expect(parseState({ ...state, notes: { [ID_C]: "Changed" } })).not.toBe(state);
    expect(parseState({ ...state, tasks: Array.from({ length: 200 }, (_, i) => ({
      ...state.tasks[0], id: `${ID_A}:user:${i}` })) })).not.toBeNull();
  });

  it.each([
    (s: WorkspaceState) => ({ ...s, version: 2 }),
    (s: WorkspaceState) => ({ ...s, selectedIds: [ID_A, ID_A] }),
    (s: WorkspaceState) => ({ ...s, selectedIds: [ID_A, ID_B, ID_C, ID_A, ID_B] }),
    (s: WorkspaceState) => ({ ...s, brief: { ...s.brief, county: "Hays County", metro: "Austin" } }),
    (s: WorkspaceState) => ({ ...s, brief: { ...s.brief, mw: Infinity } }),
    (s: WorkspaceState) => ({ ...s, brief: { ...s.brief, criterion: "invented" } }),
    (s: WorkspaceState) => ({ ...s, decisions: { invalid: "hold" } }),
    (s: WorkspaceState) => ({ ...s, notes: { [ID_A]: "x".repeat(4001) } }),
    (s: WorkspaceState) => ({ ...s, tasks: [...s.tasks, s.tasks[0]] }),
    (s: WorkspaceState) => ({ ...s, tasks: [{ ...s.tasks[0], text: "x".repeat(501) }] }),
    (s: WorkspaceState) => ({ ...s, tasks: Array.from({ length: 2001 }, (_, i) => ({
      ...s.tasks[0], id: `${ID_A}:user:${i}` })) }),
    (s: WorkspaceState) => ({ ...s, tasks: [{ ...s.tasks[0], projectId: "invalid" }] }),
    (s: WorkspaceState) => ({ ...s, updatedAt: "2026-02-30T00:00:00Z" }),
    (s: WorkspaceState) => ({ ...s, extra: true }),
  ])("rejects malformed or over-limit saved state %#", (change) => {
    const valid: WorkspaceState = { version: 1, brief, selectedIds: [ID_A], decisions: {}, notes: {},
      tasks: [{ id: `${ID_A}:user:one`, projectId: ID_A, checkId: null, text: "Ask utility", origin: "user", done: false }],
      updatedAt: "2026-11-14T12:00:00.000Z" };
    expect(parseState(change(valid))).toBeNull();
  });
});
