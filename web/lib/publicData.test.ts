import fs from "node:fs";
import { describe, expect, it } from "vitest";
import artifact from "../../data/model/risk_model.json";
import { band, displayScore } from "./model";
import { buildPublicDataset, filterPublicSites, parseCsv, publicHistory, nearbyPublicSites } from "./publicData";

const projectCsv = fs.readFileSync("../data/labels/tx_projects.csv", "utf8");
const featureCsv = fs.readFileSync("../data/features/tx_project_features.csv", "utf8");
const sanMarcos = "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9";

describe("public CSV contract", () => {
  it("handles quoted commas, escaped quotes, embedded newlines, CRLF and empty fields", () => {
    expect(parseCsv('id,name,note\r\n1,"a, b","She said ""yes""\nnext line"\r\n2,,\r\n'))
      .toEqual([{ id: "1", name: "a, b", note: 'She said "yes"\nnext line' }, { id: "2", name: "", note: "" }]);
    expect(parseCsv('\uFEFFa,b\n"x",y')).toEqual([{ a: "x", b: "y" }]);
    expect(parseCsv("a,b\n")).toEqual([]);
  });
  it.each(['', 'a,a\n1,2', 'a,\n1,2', 'a,b\n1', 'a\n"unfinished', 'a\na"b', 'a\n"quoted"tail'])
    ("rejects malformed CSV %j", (csv) => expect(() => parseCsv(csv)).toThrow());
  it("parses both committed files without dropping records", () => {
    const projects = parseCsv(projectCsv);
    const features = parseCsv(featureCsv);
    expect(projects).toHaveLength(349);
    expect(features).toHaveLength(349);
    expect(new Set(projects.map((r) => r.project_id))).toEqual(new Set(features.map((r) => r.project_id)));
  });
});

describe("public scores preserve the committed loader's semantics", () => {
  const dataset = () => buildPublicDataset(projectCsv, featureCsv, artifact);
  it("reproduces the 102 training projects and training mean, with null unreliable scores", () => {
    const { sites } = dataset();
    const training = sites.filter((s) => s.in_training_set);
    const scored = sites.filter((s) => s.p_stopped !== null);
    expect(scored).toHaveLength(339);
    expect(scored.every((s) => band(displayScore(s.p_stopped)! / 100) === s.band)).toBe(true);
    expect(training).toHaveLength(102);
    const mean = training.reduce((sum, s) => sum + s.p_stopped!, 0) / training.length;
    expect(Math.abs(mean - artifact.comparisons.recent.metrics.mean_score_training)).toBeLessThan(0.005);
    expect(sites.filter((s) => !s.location_reliable).every((s) => s.p_stopped === null && s.band === null && s.in_training_set === null)).toBe(true);
    expect(sites.filter((s) => s.tracker_status === "operational").every((s) => !s.in_training_set)).toBe(true);
    expect(sites.find((s) => s.project_id === sanMarcos)?.in_training_set).toBe(true);
    // Independently calculated with Python's saved-coefficient loader formula.
    expect(sites.find((s) => s.project_id === sanMarcos)?.p_stopped).toBe(0.596);
    expect(sites.find((s) => s.project_id === sanMarcos)?.model_version).toBe(`logreg-recent-${artifact.trained}`);
  });
  it("uses the intercept, feature order, means and standard deviations from the selected model", () => {
    const altered = structuredClone(artifact);
    altered.comparisons.recent.intercept = Math.log(4);
    altered.comparisons.recent.coefficients = Object.fromEntries(Object.keys(altered.comparisons.recent.coefficients).map((k) => [k, 0])) as typeof altered.comparisons.recent.coefficients;
    const scored = buildPublicDataset(projectCsv, featureCsv, altered).sites.filter((s) => s.location_reliable);
    expect(scored.every((s) => s.p_stopped === 0.8 && s.band === "red")).toBe(true);
  });
  it("rejects incomplete joins, duplicate IDs, missing values and invalid model parameters", () => {
    expect(() => buildPublicDataset(projectCsv, featureCsv.split('\n').slice(0, -2).join('\n'), artifact)).toThrow(/matching/);
    expect(() => buildPublicDataset(projectCsv + projectCsv.split('\n')[1] + '\n', featureCsv, artifact)).toThrow(/duplicate/i);
    expect(() => buildPublicDataset(projectCsv.replace('32.74', 'invalid'), featureCsv, artifact)).toThrow(/lat/);
    expect(() => buildPublicDataset(projectCsv, featureCsv, {})).toThrow();
    for (const update of [
      { feature_std: [0, 1, 1, 1, 1, 1] }, { feature_mean: [1] }, { intercept: Infinity },
      { coefficients: { unexpected: 1 } },
    ]) {
      const changed = { ...artifact, comparisons: { ...artifact.comparisons, recent: { ...artifact.comparisons.recent, ...update } } };
      expect(() => buildPublicDataset(projectCsv, featureCsv, changed)).toThrow();
    }
  });
  it("provides one artifact-dated history entry only for scored projects", () => {
    const data = dataset();
    expect(publicHistory(data, sanMarcos)).toEqual([{ at: artifact.trained, p_stopped: data.sites.find((s) => s.project_id === sanMarcos)!.p_stopped, model_version: `logreg-recent-${artifact.trained}` }]);
    expect(publicHistory(data, "unknown")).toEqual([]);
    expect(publicHistory(data, data.sites.find((s) => !s.location_reliable)!.project_id)).toEqual([]);
  });
});

describe("public project browsing", () => {
  const sites = buildPublicDataset(projectCsv, featureCsv, artifact).sites;
  it("filters status, case-insensitive text, band and water without mutating its dataset", () => {
    const before = JSON.stringify(sites);
    expect(filterPublicSites(sites, {}).every((s) => s.label === "unlabeled")).toBe(true);
    expect(filterPublicSites(sites, { status: "all" })).toHaveLength(349);
    expect(filterPublicSites(sites, { status: "stopped", q: "HAYS", band: "watch" }).map((s) => s.project_id)).toContain(sanMarcos);
    expect(filterPublicSites(sites, { status: "built" }).every((s) => s.label === "built")).toBe(true);
    expect(filterPublicSites(sites, { status: "all", water: "2" }).every((s) => s.water_stress_score !== null && s.water_stress_score <= 2)).toBe(true);
    expect(filterPublicSites(sites, { status: "all", water: "garbage" })).toHaveLength(349);
    expect(filterPublicSites(sites, { status: "all", q: "not-found-xyz" })).toEqual([]);
    expect(JSON.stringify(sites)).toBe(before);
  });
  it("sorts by name or by score with unscored projects last", () => {
    const byName = filterPublicSites(sites, { status: "all", sort: "name" });
    expect(byName.map((s) => s.name)).toEqual(sites.map((s) => s.name).toSorted((a, b) => a.localeCompare(b)));
    const byRisk = filterPublicSites(sites, { status: "all" });
    expect(byRisk.at(-1)?.p_stopped).toBeNull();
    const scores = byRisk.filter((s) => s.p_stopped !== null).map((s) => s.p_stopped!);
    expect(scores).toEqual(scores.toSorted((a, b) => a - b));
  });
  it("finds nearest lower-score non-stopped projects by great-circle distance", () => {
    const base = sites.find((s) => s.project_id === sanMarcos)!;
    const fake = [
      { ...base, project_id: "me", lat: 0, lng: 0, p_stopped: 0.8 },
      { ...base, project_id: "near", lat: 0, lng: 1, p_stopped: 0.2, label: "built" },
      { ...base, project_id: "far", lat: 0, lng: 2, p_stopped: 0.3, label: "unlabeled" },
      { ...base, project_id: "stopped", lat: 0, lng: 0.1, p_stopped: 0.1, label: "stopped" },
      { ...base, project_id: "higher", lat: 0, lng: 0.1, p_stopped: 0.9, label: "built" },
      { ...base, project_id: "unknown", lat: 0, lng: 0.1, p_stopped: null, label: "built" },
    ];
    const near = nearbyPublicSites(fake, "me");
    expect(near.map((s) => s.project_id)).toEqual(["near", "far"]);
    expect(near[0].km).toBeCloseTo(111.2, 1);
    expect(nearbyPublicSites(fake, "me", 1)).toHaveLength(1);
    expect(nearbyPublicSites(fake, "missing")).toEqual([]);
    expect(nearbyPublicSites(fake, "unknown")).toEqual([]);
  });
});
