import fs from "node:fs";
import { describe, expect, it } from "vitest";
import fixture from "../../data/signals/risk_signals.json";
import modelArtifact from "../../data/model/risk_model.json";
import { computeCaseStudies, summarizeCaseStudies, type CaseStudyProject } from "./caseStudies";
import { buildPublicDataset } from "./publicData";
import { parseSignals } from "./signals";

const sanMarcos = "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9";
const sabey = "4ed87767-70bd-4287-9af6-bff25ef45241";
const cloudburst = "c387151f-37d4-4196-b39e-8628bb5a7743";
const projects: CaseStudyProject[] = [
  { projectId: sabey, name: "Sabey", county: "Hays County", state: "TX", modelBand: "red", trackerStatus: "proposed" },
  { projectId: sanMarcos, name: "San Marcos", county: "Hays County", state: "TX", modelBand: "watch", trackerStatus: "defeated" },
  { projectId: cloudburst, name: "CloudBurst", county: "Hays County", state: "TX", modelBand: "green", trackerStatus: "under_construction" },
  { projectId: "other-project", name: "Other", county: "Travis County", state: "TX", modelBand: "green", trackerStatus: "proposed" },
];

describe("retrospective case studies", () => {
  it("counts Athens city context separately and leaves the project record without a raise or outcome", () => {
    const cityRecord = { ...fixture[2], signal_id: "athens-ordinance-enacted", scope: "city",
      city: "Athens city", county: "Henderson County", state: "TX", check_id: "policy",
      signal_type: "ordinance_enacted", effect: "context" };
    const [athens] = computeCaseStudies([{ projectId: "53035780-aaef-4edb-b279-eb8e2b5cc470",
      name: "Athens", city: "Athens city", county: "Henderson County", state: "TX", inCityLimits: true,
      modelBand: "watch", trackerStatus: "defeated" }], parseSignals([fixture[8], cityRecord]));
    expect(athens).toMatchObject({ directCount: 1, cityContextCount: 1, countyContextCount: 0,
      totalCount: 2, firstRaiseDay: null, outcome: null, leadStatus: "no_outcome_record", leadDays: null });
  });

  it("counts a city-and-county-only row in both area summary columns", () => {
    const county = { ...fixture[2] };
    const city = { ...county, signal_id: "hays-city-context", scope: "city", city: "San Marcos city" };
    const [row] = computeCaseStudies([{ projectId: "c387151f-37d4-4196-b39e-8628bb5a7743",
      name: "CloudBurst", city: "San Marcos city", county: "Hays County", state: "TX", inCityLimits: true,
      modelBand: "green", trackerStatus: "under_construction" }], parseSignals([county, city]));
    expect(row).toMatchObject({ directCount: 0, countyContextCount: 1, cityContextCount: 1,
      totalCount: 2, recordStatus: "area_context_only", leadStatus: "no_project_record" });
    expect(summarizeCaseStudies([row])).toEqual({ positiveLead: 0, noLead: 0,
      raiseWithoutRecordedStopOutcome: 0, countyContextOnly: 1, cityContextOnly: 1 });
  });

  it("pins all seven rows from the committed public sites and ten reviewed fixture signals", () => {
    const publicSites = buildPublicDataset(
      fs.readFileSync(new URL("../../data/labels/tx_projects.csv", import.meta.url), "utf8"),
      fs.readFileSync(new URL("../../data/features/tx_project_features.csv", import.meta.url), "utf8"),
      modelArtifact,
    ).sites;
    const publicProjects: CaseStudyProject[] = publicSites.map((site) => ({
      projectId: site.project_id, name: site.name, county: site.county, state: "TX",
      city: site.city, inCityLimits: site.in_city_limits,
      modelBand: site.band, trackerStatus: site.tracker_status,
    }));
    const signals = parseSignals(fixture);
    expect(signals).toHaveLength(10);
    const rows = computeCaseStudies(publicProjects, signals);
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.projectId).sort()).toEqual([
      sanMarcos, sabey, cloudburst,
      "36a8e10f-045d-47b7-8e64-0319d509ce45", // Matrix
      "4f2eaf6e-61e0-4721-8ac1-8f12718c64c8", // Tomahawk
      "53035780-aaef-4edb-b279-eb8e2b5cc470", // Athens
      "6251ccd6-f245-4bf4-bdf1-118825fa3123", // Diode, city context only
    ].sort());
    const byId = new Map(rows.map((row) => [row.projectId, row]));
    expect(byId.get(sanMarcos)).toMatchObject({
      totalCount: 4, directCount: 3, countyContextCount: 1, cityContextCount: 0,
      firstRaiseDay: "2025-08-20",
      outcome: { type: "outcome_denied", day: "2026-02-18", basis: "event" },
      leadStatus: "positive_lead", leadDays: 182,
    });
    expect(byId.get("36a8e10f-045d-47b7-8e64-0319d509ce45")).toMatchObject({
      totalCount: 2, directCount: 2, countyContextCount: 0, cityContextCount: 0,
      firstRaiseDay: null,
      outcome: { signalId: "matrix-construction-suspended-2026-01",
        type: "outcome_suspended", day: "2026-01-21", basis: "publication" },
      leadStatus: "no_raise_recorded", leadDays: null,
    });
    expect(byId.get("4f2eaf6e-61e0-4721-8ac1-8f12718c64c8")).toMatchObject({
      totalCount: 2, directCount: 2, countyContextCount: 0, cityContextCount: 0,
      firstRaiseDay: "2026-09-02",
      outcome: { signalId: "tomahawk-proposal-withdrawn-2026-09",
        type: "outcome_withdrawn", day: "2026-09-08", basis: "publication", precision: "minute" },
      leadStatus: "positive_lead", leadDays: 6,
    });
    expect(byId.get("53035780-aaef-4edb-b279-eb8e2b5cc470")).toMatchObject({
      totalCount: 2, directCount: 1, countyContextCount: 0, cityContextCount: 1,
      firstRaiseDay: null, outcome: null, leadStatus: "no_outcome_record", leadDays: null,
    });
    expect(byId.get("6251ccd6-f245-4bf4-bdf1-118825fa3123")).toMatchObject({
      totalCount: 1, directCount: 0, countyContextCount: 0, cityContextCount: 1,
      recordStatus: "area_context_only", firstRaiseDay: null, outcome: null,
      leadStatus: "no_project_record", leadDays: null,
    });
    expect(signals.filter((signal) => signal.scope === "project"
      && signal.entity_id === "53035780-aaef-4edb-b279-eb8e2b5cc470"))
      .toMatchObject([{ signal_id: "athens-resident-opposition-2026-04",
        signal_type: "organized_opposition", effect: "context" }]);
    for (const projectId of [sabey, cloudburst]) {
      expect(byId.get(projectId)).toMatchObject({
        totalCount: 1, directCount: 0, countyContextCount: 1, cityContextCount: 0,
        recordStatus: "area_context_only", firstRaiseDay: null,
        outcome: null, leadStatus: "no_project_record", leadDays: null,
      });
    }
    expect(rows.filter((row) => publicSites.some((site) => site.project_id === row.projectId
      && site.label === "built") && row.directCount > 0)).toHaveLength(0);
    expect(summarizeCaseStudies(rows)).toEqual({
      positiveLead: 2, noLead: 1, raiseWithoutRecordedStopOutcome: 0, countyContextOnly: 2, cityContextOnly: 1,
    });
  });

  it("pins the three fixture rows, the San Marcos 182-day lead, and county-only cases", () => {
    const rows = computeCaseStudies(projects, parseSignals(fixture));
    expect(rows.map((row) => row.name)).toEqual(["CloudBurst", "Sabey", "San Marcos"]);
    expect(rows.find((row) => row.projectId === sanMarcos)).toMatchObject({
      modelBand: "watch", trackerStatus: "defeated", totalCount: 4, directCount: 3, countyContextCount: 1,
      recordStatus: "project_records", firstRaiseDay: "2025-08-20",
      outcome: { signalId: fixture[3].signal_id, type: "outcome_denied", day: "2026-02-18", basis: "event", precision: "minute" },
      leadStatus: "positive_lead", leadDays: 182,
    });
    for (const projectId of [sabey, cloudburst]) {
      expect(rows.find((row) => row.projectId === projectId)).toMatchObject({
        totalCount: 1, directCount: 0, countyContextCount: 1, cityContextCount: 0, recordStatus: "area_context_only",
        firstRaiseDay: null, outcome: null, leadStatus: "no_project_record", leadDays: null,
      });
    }
    expect(summarizeCaseStudies(rows)).toEqual({ positiveLead: 1, noLead: 0, raiseWithoutRecordedStopOutcome: 0,
      countyContextOnly: 2, cityContextOnly: 0 });
  });

  it("reports same-day or later raises as no lead and outcomes without raises separately", () => {
    const sameDay = parseSignals([
      { ...fixture[0], published_at: "2026-02-18" },
      fixture[3],
    ]);
    const [row] = computeCaseStudies([projects[1]], sameDay);
    expect(row).toMatchObject({ firstRaiseDay: "2026-02-18", leadStatus: "no_lead", leadDays: null });
    expect(summarizeCaseStudies([row]).noLead).toBe(1);
    const [laterRaise] = computeCaseStudies([projects[1]], parseSignals([
      { ...fixture[0], published_at: "2026-02-19" }, fixture[3],
    ]));
    expect(laterRaise).toMatchObject({ firstRaiseDay: "2026-02-19", leadStatus: "no_lead", leadDays: null });
    const [withoutRaise] = computeCaseStudies([projects[1]], parseSignals([fixture[1], fixture[3]]));
    expect(withoutRaise).toMatchObject({ leadStatus: "no_raise_recorded", leadDays: null });
    expect(summarizeCaseStudies([withoutRaise]).noLead).toBe(1);
  });

  it("uses outcome event day in Chicago, falling back to publication day when event is unknown", () => {
    const outcome = { ...fixture[3], event_at: "2026-02-18T05:59:00Z", published_at: "2026-02-19T11:38:00-06:00" };
    const [eventRow] = computeCaseStudies([projects[1]], parseSignals([fixture[0], outcome]));
    expect(eventRow.outcome).toMatchObject({ day: "2026-02-17", basis: "event", precision: "minute" });
    const [publicationRow] = computeCaseStudies([projects[1]], parseSignals([fixture[0], {
      ...outcome, event_at: null, event_precision: "unknown", published_at: "2026-02-18T05:59:00Z",
    }]));
    expect(publicationRow.outcome).toMatchObject({ day: "2026-02-17", basis: "publication", precision: "minute" });
    const aroundDst = parseSignals([
      { ...fixture[3], signal_id: "before-midnight", event_at: "2026-11-01T04:59:59Z", published_at: "2026-11-01T12:00:00Z" },
      { ...fixture[3], signal_id: "after-midnight", event_at: "2026-11-01T05:00:00Z", published_at: "2026-11-01T12:01:00Z" },
    ]);
    const [dstRow] = computeCaseStudies([projects[1]], aroundDst);
    expect(dstRow.outcome).toMatchObject({ signalId: "before-midnight", day: "2026-10-31", basis: "event", precision: "minute" });
  });

  it("chooses the earliest typed outcome deterministically by outcome day, publication, then ID", () => {
    const outcomes = parseSignals([
      { ...fixture[3], signal_id: "z-later-event", event_at: "2026-02-19", event_precision: "day" },
      { ...fixture[3], signal_id: "b-same-day", signal_type: "outcome_approved", event_at: "2026-02-18", event_precision: "day", published_at: "2026-02-18T12:00:00-06:00" },
      { ...fixture[3], signal_id: "a-same-day", signal_type: "outcome_denied", event_at: "2026-02-18", event_precision: "day", published_at: "2026-02-18T12:00:00-06:00" },
      { ...fixture[3], signal_id: "c-earlier-publication", event_at: "2026-02-18", event_precision: "day", published_at: "2026-02-18T11:00:00-06:00" },
    ]);
    const [row] = computeCaseStudies([projects[1]], outcomes);
    expect(row.outcome).toMatchObject({ signalId: "c-earlier-publication", day: "2026-02-18", basis: "event", precision: "day" });
    const [tieRow] = computeCaseStudies([projects[1]], outcomes.filter((signal) => signal.signal_id !== "c-earlier-publication"));
    expect(tieRow.outcome?.signalId).toBe("a-same-day");
  });

  it("keeps first raise visible without an outcome, and counts an approval after a raise as no recorded stop outcome", () => {
    const [withoutOutcome] = computeCaseStudies([projects[1]], parseSignals([fixture[0]]));
    expect(withoutOutcome).toMatchObject({ firstRaiseDay: "2025-08-20", outcome: null,
      leadStatus: "no_outcome_record", leadDays: null });
    expect(summarizeCaseStudies([withoutOutcome]).raiseWithoutRecordedStopOutcome).toBe(1);
    const [approved] = computeCaseStudies([projects[1]], parseSignals([fixture[0], {
      ...fixture[3], signal_id: "approved", signal_type: "outcome_approved",
    }]));
    expect(approved).toMatchObject({ outcome: { type: "outcome_approved" }, leadStatus: "positive_lead", leadDays: 182 });
    expect(summarizeCaseStudies([approved]).raiseWithoutRecordedStopOutcome).toBe(1);
  });

  it.each(["outcome_denied", "outcome_suspended", "outcome_withdrawn"])(
    "treats a sourced %s as a stop-type outcome with the same lead calculation", (signalType) => {
      const [row] = computeCaseStudies([projects[1]], parseSignals([fixture[0], {
        ...fixture[3], signal_type: signalType,
      }]));
      expect(row).toMatchObject({ outcome: { type: signalType }, leadStatus: "positive_lead", leadDays: 182 });
      expect(summarizeCaseStudies([row]).raiseWithoutRecordedStopOutcome).toBe(0);
    },
  );

  it("ignores unreviewed submissions and does not mutate projects or signals", () => {
    const submitted = parseSignals([{ ...fixture[1], signal_id: "submitted", proposed_by: "visitor", verification: {
      method: "verbatim_match", verified_at: "2026-11-14T11:00:00Z", publication_date_basis: "submitter",
    } }]);
    const input = [...parseSignals(fixture), ...submitted];
    const before = JSON.stringify({ projects, input });
    const rows = computeCaseStudies(projects, input);
    expect(rows.find((row) => row.projectId === sanMarcos)?.totalCount).toBe(4);
    expect(JSON.stringify({ projects, input })).toBe(before);
    const sameName = [{ ...projects[0], name: "Same name" }, { ...projects[2], name: "Same name" }];
    expect(computeCaseStudies([...sameName].reverse(), parseSignals(fixture)).map((row) => row.projectId))
      .toEqual([sabey, cloudburst]);
  });
});
