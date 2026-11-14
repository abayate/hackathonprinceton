import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseModelCard } from "./modelCard";
import { BANDS, CONSTANTS, displayScore, economics, money } from "./model";

const readme = fs.readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const evidenceSources = fs.readFileSync(new URL("../../docs/EVIDENCE_SOURCES.md", import.meta.url), "utf8");
const sourceRegistry = fs.readFileSync(new URL("../../data/sources.csv", import.meta.url), "utf8");
const artifact = parseModelCard(JSON.parse(fs.readFileSync(new URL("../../data/model/risk_model.json", import.meta.url), "utf8")));

function metricRow(label: string): string {
  const matches = readme.split("\n").filter((line) => line.startsWith(`| ${label} |`));
  expect(matches, `README must have one ${label} row`).toHaveLength(1);
  return matches[0].split("|")[2].trim();
}

describe("documented model facts", () => {
  it("opens with the verified problem statement and mirrors it in the demo", () => {
    const problem = "Data center siting decisions depend on evidence scattered across project records and local reporting. Groundwork brings those signals into one place for an early screening review.";
    expect(readme).toContain(problem);
    const demo = fs.readFileSync(new URL("../../docs/DEMO.md", import.meta.url), "utf8");
    expect(demo).toContain(problem);
  });

  it("marks the investigator as optional and untested against the live service", () => {
    expect(readme).toContain("not tested against the live service");
    const demo = fs.readFileSync(new URL("../../docs/DEMO.md", import.meta.url), "utf8");
    expect(demo).toContain("not tested against the live service");
    expect(demo).toMatch(/do not claim a live AI investigator/i);
  });

  it("distinguishes synthetic database-mode rendering from live integration verification", () => {
    expect(readme).toContain("render-tested against synthetic rows");
    expect(readme).toContain("Read-only database queries and selected page renders were verified");
    expect(readme).toContain("No database writes, ingestion, schema changes, watchlist persistence, or failing live SQL recovery were exercised");
    expect(readme).toContain("Live Vexcel imagery/3D and Gemini remain unverified");
    expect(readme).toContain("automatic error-boundary navigation");
    expect(readme).not.toContain("Database mode — built by the team at commit `f986561`, not re-verified here");
  });

  it("keeps the stated training cohort aligned with the deployed model artifact", () => {
    const metrics = artifact.metrics;
    expect(metricRow("Training cohort")).toBe(`${metrics.n_stopped} stopped + ${metrics.n_built} under construction (${metrics.n_projects} total)`);
  });

  it("keeps the cross-validation AUC aligned with the artifact", () => {
    expect(metricRow("Cross-validated ROC AUC")).toBe(`${artifact.metrics.roc_auc_mean.toFixed(2)} ± ${artifact.metrics.roc_auc_std.toFixed(2)}`);
  });

  it.each(["green", "watch", "red"] as const)("keeps the %s band outcome share aligned with held-out predictions", (band) => {
    const rate = artifact.metrics.band_outcomes_oof.bands[band].rate;
    expect(rate).not.toBeNull();
    expect(metricRow(`${band} stopped share`)).toBe(`${(rate! * 100).toFixed(1)}%`);
  });

  it("keeps the change guide's old score ranges and new 100 MW band figures tied to their formulas", () => {
    const guide = fs.readFileSync(new URL("../../docs/CHANGES.md", import.meta.url), "utf8");
    const mw = 100;
    const monthlyLease = mw * 1000 * CONSTANTS.leaseUsdPerKwMonth.value;
    const oldCostAt = (score: number) => score * CONSTANTS.typicalDelayMonths.value * monthlyLease;
    const millions = (dollars: number) => (dollars / 1e6).toFixed(1).replace(/\.0$/, "");
    expect(guide).toContain(`Old = raw score × ${CONSTANTS.typicalDelayMonths.value} months × $${millions(monthlyLease)}M/month`);

    const cases = [
      { name: "Low risk (green)", band: "green", min: 0, max: BANDS.watch, openUpper: true },
      { name: "Watch", band: "watch", min: BANDS.watch, max: BANDS.red, openUpper: true },
      { name: "High risk (red)", band: "red", min: BANDS.red, max: 1, openUpper: false },
    ] as const;
    const shares: string[] = [];
    for (const { name, band, min, max, openUpper } of cases) {
      const rate = artifact.metrics.band_outcomes_oof.bands[band].rate;
      expect(rate).not.toBeNull();
      shares.push(`${(rate! * 100).toFixed(1)}%`);
      const oldRange = `$${millions(oldCostAt(min))}${min === 0 ? "" : "M"}–${openUpper ? "<" : ""}$${millions(oldCostAt(max))}M`;
      const newFigure = money(economics(rate, mw).expectedDelayCost);
      const row = guide.split("\n").find((line) => line.startsWith(`| ${name} |`));
      expect(row, `Missing change-guide row for ${name}`).toBeDefined();
      const cells = row!.split("|").slice(1, -1).map((cell) => cell.trim());
      expect(cells, `Change-guide row for ${name}`).toEqual([name, oldRange, newFigure]);
    }
    expect(guide).toContain("[0, 0.4)");
    expect(guide).toContain("[0.4, 0.6)");
    expect(guide).toContain("[0.6, 1]");
    expect(guide).toContain(`${shares[0]}, ${shares[1]}, and ${shares[2]}`);
    expect(guide).toContain(`raw \`0.596\` displays as **${displayScore(0.596)}/100**`);
  });

  it("distinguishes the San Marcos held-out score from the deployed score", () => {
    expect(artifact.holdoutDemo).not.toBeNull();
    const holdout = artifact.holdoutDemo!;
    expect(metricRow("San Marcos held-out score")).toBe(`${displayScore(holdout.score)}/100 (raw ${holdout.score.toFixed(6)})`);
  });

  it("documents the fixed Task 014 selection and its retrospective limits", () => {
    expect(evidenceSources).toContain("271153b07d6342bce6939ff2528841c528dd62818829c0af3d2264736a9ef0b5");
    for (const project of ["Matrix Data Center Campus", "Project Tomahawk", "Data Factory Athens Data Center", "Princeton Data Center", "CoreWeave Denton AI Data Center"]) {
      expect(evidenceSources).toContain(project);
    }
    expect(evidenceSources.replaceAll("**", "")).toMatch(/does not validate the evidence rule/i);
    expect(readme).toContain("ten records and seven case-study rows");
    const demo = fs.readFileSync(new URL("../../docs/DEMO.md", import.meta.url), "utf8");
    expect(demo).toMatch(/not a validation of the rule/i);
  });

  it("credits every new manually reviewed evidence source in the source registry", () => {
    for (const id of ["R05", "R06", "R07", "R08", "R09", "R13"]) {
      expect(sourceRegistry.split("\n").some((row) => row.startsWith(`${id},`)), `Missing registry entry ${id}`).toBe(true);
    }
    for (const url of [
      "https://www.kltv.com/2026/01/21/judge-hears-arguments-lawsuits-surrounding-proposed-east-texas-data-center/",
      "https://www.cbsnews.com/texas/news/prosper-tx-project-tomahawk-pulled-9-8-2026/",
      "https://www.ketk.com/news/local-news/data-center-boom-hits-a-wall-in-athens-after-resident-opposition/",
    ]) {
      expect(evidenceSources).toContain(url);
    }
    expect(evidenceSources).toContain("Matcher: HTTP 200, exact match.");
    expect(evidenceSources).toContain("quote was confirmed against the readable browser page");
  });

  it("keeps the original investment direction distinct from shipped capabilities", () => {
    expect(readme).toContain("find land worth buying");
    expect(readme).toContain("Purchase verdicts, a maximum purchase price, full ten-year costs and a property investment memo are not implemented yet");
    expect(readme).toContain("not a valuation or maximum bid");
    expect(readme).not.toMatch(/\bTODO\b/);
  });

  it("keeps the training label disclosure aligned with the separate review fixture", () => {
    const reviews: { kind_finding: string; date_finding: string }[] = JSON.parse(
      fs.readFileSync(new URL("../../data/signals/label_review.json", import.meta.url), "utf8"));
    const kind = reviews.filter((entry) => entry.kind_finding === "consistent").length;
    const date = reviews.filter((entry) => entry.date_finding === "consistent").length;
    for (const doc of [readme, evidenceSources]) {
      expect(doc).toContain(`${reviews.length} of ${artifact.metrics.n_stopped} stopped training labels`);
      expect(doc).toContain(`${kind} consistent in outcome kind and ${date} consistent in date`);
      expect(doc).toContain("not an audit");
      expect(doc).toContain("not established");
    }
    const demo = fs.readFileSync(new URL("../../docs/DEMO.md", import.meta.url), "utf8");
    expect(demo).toContain("Tracker status");
    expect(demo).toContain("not an audit");
  });

  it("credits every directly declared web and Python dependency", () => {
    const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const python = fs.readFileSync(new URL("../../scripts/requirements.txt", import.meta.url), "utf8")
      .split("\n").filter((line) => line.trim() && !line.startsWith("#")).map((line) => line.split("==")[0]);
    const packages = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies), ...python];
    for (const name of packages) expect(readme, `Missing library credit for ${name}`).toContain(`[${name}](`);
  });
});
