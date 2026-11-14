import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import fixture from "../../data/signals/risk_signals.json";
import { buildChangeFeed, buildTimeline, evidenceBaseline, parseSignals, signalAppliesTo, signalScopeLabel } from "./signals";
import { economics, stoppedShareForBand } from "./model";
import { parseModelCard } from "./modelCard";
import { buildPublicDataset } from "./publicData";
import artifact from "../../data/model/risk_model.json";

const entityId = "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9";
const sabeyId = "4ed87767-70bd-4287-9af6-bff25ef45241";
const cloudburstId = "c387151f-37d4-4196-b39e-8628bb5a7743";
const athensId = "53035780-aaef-4edb-b279-eb8e2b5cc470";
const diodeId = "6251ccd6-f245-4bf4-bdf1-118825fa3123";
const hays = { county: "Hays County", state: "TX" };
function countyRecord(): Record<string, unknown> {
  const record: Record<string, unknown> = { ...fixture[2], scope: "county", county: " Hays County ", state: " tx " };
  delete record.entity_id;
  return record;
}
function cityRecord(): Record<string, unknown> {
  const record: Record<string, unknown> = { ...fixture[2], signal_id: "athens-ordinance-enacted",
    scope: "city", city: " Athens city ", county: " Henderson County ", state: " tx ",
    check_id: "policy", signal_type: "ordinance_enacted", effect: "context" };
  delete record.entity_id;
  return record;
}

it("pins both Athens projects inside the exact recorded city limits", () => {
  const root = path.resolve(process.cwd(), "..", "data");
  const sites = buildPublicDataset(
    fs.readFileSync(path.join(root, "labels", "tx_projects.csv"), "utf8"),
    fs.readFileSync(path.join(root, "features", "tx_project_features.csv"), "utf8"), artifact,
  ).sites;
  expect([athensId, diodeId].map((id) => {
    const site = sites.find((entry) => entry.project_id === id);
    return [site?.city, site?.county, site?.in_city_limits];
  })).toEqual([["Athens city", "Henderson County", true], ["Athens city", "Henderson County", true]]);
});

it("pins all three Hays County project IDs and bands to the committed public CSV and model", () => {
  const root = path.resolve(process.cwd(), "..", "data");
  const dataset = buildPublicDataset(
    fs.readFileSync(path.join(root, "labels", "tx_projects.csv"), "utf8"),
    fs.readFileSync(path.join(root, "features", "tx_project_features.csv"), "utf8"), artifact,
  );
  const sites = [entityId, sabeyId, cloudburstId].map((id) => dataset.sites.find((site) => site.project_id === id));
  expect(sites.map((site) => [site?.project_id, site?.county, site?.band])).toEqual([
    [entityId, "Hays County", "watch"], [sabeyId, "Hays County", "red"], [cloudburstId, "Hays County", "green"],
  ]);
  const signals = parseSignals(fixture);
  for (const site of sites) {
    const before = buildTimeline(signals, site!.project_id, site!.band, "2026-02-15", { county: site!.county, state: "TX" });
    const after = buildTimeline(signals, site!.project_id, site!.band, "2026-02-16", { county: site!.county, state: "TX" });
    expect([before.known.length, after.known.length]).toEqual(site!.project_id === entityId ? [2, 3] : [0, 1]);
    expect(after.evidenceBand).toBe(site!.project_id === entityId ? "red" : site!.band);
  }
});

describe("dated changes for saved projects", () => {
  const signals = parseSignals(fixture);
  const holdout = parseModelCard(artifact).holdoutDemo;
  const saved = [{ entityId, name: "San Marcos", modelBand: "watch" as const, savedAt: "2026-11-14T10:00:00Z", ...hays }];
  it("replays four records with exactly one Watch-to-Red rule transition", () => {
    const changes = buildChangeFeed(signals, saved, holdout, "2025-08-01");
    expect(changes).toHaveLength(4);
    expect(changes[0]).toMatchObject({ publicationDay: "2025-08-20", transition: { from: "watch", to: "red" } });
    expect(changes.slice(1).every((c) => c.transition === null)).toBe(true);
    expect(changes.at(-1)?.signal.effect).toBe("outcome");
    expect(buildChangeFeed(signals, saved, holdout, "2026-02-17")).toMatchObject([{ signal: { effect: "outcome" }, transition: null }]);
    expect(buildChangeFeed(signals, saved, holdout, "2025-08-20")).toHaveLength(3);
  });
  it("uses recorded-at for live changes, including older sources added later", () => {
    expect(buildChangeFeed(signals, saved, holdout)).toEqual([]);
    const later = parseSignals([{ ...fixture[1], recorded_at: "2026-11-14T11:00:00Z" }]);
    expect(buildChangeFeed(later, saved, holdout)).toHaveLength(1);
    expect(buildChangeFeed(later, [{ ...saved[0], savedAt: "2026-11-14T11:00:00Z" }], holdout)).toEqual([]);
  });
  it("computes live transitions in recording order and replay transitions in publication order", () => {
    const rows = parseSignals([
      { ...fixture[0], signal_id: "late-discovered", recorded_at: "2026-11-14T11:00:00Z" },
      { ...fixture[0], signal_id: "already-known", published_at: "2026-01-01", recorded_at: "2026-11-14T09:00:00Z" },
    ]);
    expect(buildChangeFeed(rows, saved, holdout)[0].transition).toBeNull();
    expect(buildChangeFeed(rows, saved, holdout, "2025-01-01")[0]).toMatchObject({ signal: { signal_id: "late-discovered" }, transition: { from: "watch", to: "red" } });
  });
  it("uses the same holdout baseline as the timeline without changing stored bands or economics", () => {
    const before = JSON.stringify(saved);
    expect(evidenceBaseline(entityId, "red", holdout)).toBe("watch");
    expect(evidenceBaseline("other", "green", holdout)).toBe("green");
    expect(evidenceBaseline(entityId, null, null)).toBeNull();
    const rates = parseModelCard(artifact).metrics.band_outcomes_oof;
    const prior = economics(stoppedShareForBand(saved[0].modelBand, rates), 100);
    buildChangeFeed(signals, saved, holdout, "2025-08-01");
    expect(JSON.stringify(saved)).toBe(before);
    expect(economics(stoppedShareForBand(saved[0].modelBand, rates), 100)).toEqual(prior);
  });
  it("ignores unsaved projects and handles capped or unknown baselines without invented transitions", () => {
    expect(buildChangeFeed(signals, [], holdout, "2025-08-01")).toEqual([]);
    for (const modelBand of ["red", null] as const) {
      const entries = buildChangeFeed(signals, [{ ...saved[0], modelBand }], null, "2025-08-01");
      expect(entries.every((c) => c.transition === null)).toBe(true);
    }
    expect(() => buildChangeFeed(signals, saved, holdout, "invalid")).toThrow();
    expect(buildChangeFeed(signals, [{ ...saved[0], savedAt: "invalid" }], holdout)).toEqual([]);
  });
});

describe("San Marcos public evidence as of a Chicago calendar day", () => {
  it.each([
    ["2025-08-19", 0, "watch"], ["2025-08-20", 1, "red"],
    ["2026-02-16", 3, "red"], ["2026-02-17", 3, "red"], ["2026-02-18", 4, "red"],
  ] as const)("shows only public records on %s", (date, count, level) => {
    const result = buildTimeline(parseSignals(fixture), entityId, "watch", date, hays);
    expect(result.known).toHaveLength(count);
    expect(result.laterCount).toBe(4 - count);
    expect(result.evidenceBand).toBe(level);
    expect(result.modelBand).toBe("watch");
  });

  it("filters by publication rather than earlier event time", () => {
    const records = parseSignals([{ ...fixture[3], event_at: "2026-02-17T02:14:00-06:00" }]);
    expect(buildTimeline(records, entityId, "watch", "2026-02-17").known).toEqual([]);
  });

  it.each([
    ["2026-02-18T05:59:59Z", "2026-02-17", 1], ["2026-02-18T06:00:00Z", "2026-02-17", 0],
    ["2026-08-21T04:59:59Z", "2026-08-20", 1], ["2026-08-21T05:00:00Z", "2026-08-20", 0],
  ] as const)("uses the Chicago end of day with DST for %s", (published, asOf, count) => {
    const records = parseSignals([{ ...fixture[3], published_at: published }]);
    expect(buildTimeline(records, entityId, "watch", asOf).known).toHaveLength(count);
  });

  it("preserves the static band and monetary scenario when evidence raises a warning", () => {
    const rates = parseModelCard(artifact).metrics.band_outcomes_oof;
    const without = buildTimeline([], entityId, "watch", "2026-02-17");
    const withSignals = buildTimeline(parseSignals(fixture), entityId, "watch", "2026-02-17", hays);
    expect(withSignals.evidenceBand).toBe("red");
    expect(economics(stoppedShareForBand(withSignals.modelBand, rates), 100))
      .toEqual(economics(stoppedShareForBand(without.modelBand, rates), 100));
  });

  it("raises at most one step and never changes an unknown base band", () => {
    const signals = parseSignals(fixture);
    expect(buildTimeline(signals, entityId, "green", undefined, hays).evidenceBand).toBe("watch");
    expect(buildTimeline(signals, entityId, "red", undefined, hays).evidenceBand).toBe("red");
    expect(buildTimeline(signals, entityId, null, undefined, hays).evidenceBand).toBeNull();
    expect(buildTimeline(signals.slice(1), entityId, "watch", undefined, hays).evidenceBand).toBe("watch");
  });

  it("keeps other projects empty, does not mutate inputs, and orders by public date", () => {
    const signals = parseSignals(fixture).reverse();
    const before = JSON.stringify(signals);
    expect(buildTimeline(signals, "costar-no-records", "green").totalCount).toBe(0);
    expect(buildTimeline(signals, entityId, "watch", undefined, hays).known.map((s) => s.signal_id)).toEqual(fixture.slice(0, 4).map((s) => s.signal_id));
    expect(JSON.stringify(signals)).toBe(before);
  });

  it("orders minute-precision publications by instant across timezone offsets", () => {
    const signals = parseSignals([
      { ...fixture[3], signal_id: "later", published_at: "2026-02-18T09:00:00-06:00" },
      { ...fixture[3], signal_id: "earlier", published_at: "2026-02-18T12:00:00Z" },
      { ...fixture[3], signal_id: "unknown-hour", published_at: "2026-02-18", published_precision: "day" },
    ]);
    expect(buildTimeline(signals, entityId, "watch").known.map((s) => s.signal_id))
      .toEqual(["unknown-hour", "earlier", "later"]);
  });
});

describe("signal validation", () => {
  it("accepts only reviewed city context and jurisdiction-wide ordinance context", () => {
    expect(parseSignals([cityRecord()])[0]).toMatchObject({ scope: "city", city: "Athens city",
      county: "Henderson County", state: "TX", signal_type: "ordinance_enacted", effect: "context" });
    const countyOrdinance: Record<string, unknown> = { ...cityRecord(), scope: "county" };
    delete countyOrdinance.city;
    expect(parseSignals([countyOrdinance])[0])
      .toMatchObject({ scope: "county", signal_type: "ordinance_enacted", effect: "context" });
    for (const bad of [
      { ...cityRecord(), entity_id: athensId },
      { ...cityRecord(), city: " " },
      { ...cityRecord(), city: "Athens\ncity" },
      { ...cityRecord(), county: " " },
      { ...cityRecord(), state: " " },
      { ...cityRecord(), effect: "raise" },
      { ...cityRecord(), effect: "outcome" },
      { ...cityRecord(), proposed_by: "visitor" },
      { ...cityRecord(), verification: { method: "verbatim_match", verified_at: "2026-11-14T11:00:00Z", publication_date_basis: "submitter" } },
      { ...cityRecord(), verification: { method: "manual_review", verified_at: "2026-11-14T11:00:00Z", publication_date_basis: "investigator" } },
      { ...fixture[0], signal_type: "ordinance_enacted", effect: "raise" },
      { ...fixture[0], signal_type: "ordinance_enacted", effect: "context" },
    ]) expect(() => parseSignals([bad])).toThrow();
  });

  it("matches city context only inside the exact city, county, and state; labels display separately", () => {
    const [city] = parseSignals([cityRecord()]);
    const location = { city: " athens city ", county: " henderson county ", state: "tx", inCityLimits: true };
    expect(signalAppliesTo(city, athensId, location)).toBe(true);
    expect(signalAppliesTo(city, diodeId, location)).toBe(true);
    for (const changed of [
      { inCityLimits: false }, { inCityLimits: null }, { inCityLimits: undefined },
      { city: "Athens" }, { city: "Athens town" }, { city: null },
      { county: "Henderson" }, { county: "Travis County" }, { state: "Texas" }, { state: null },
    ]) expect(signalAppliesTo(city, athensId, { ...location, ...changed })).toBe(false);
    expect(signalAppliesTo(city, athensId)).toBe(false);
    expect(signalScopeLabel(city)).toBe("City-wide: Athens");
    expect(signalScopeLabel(parseSignals([countyRecord()])[0])).toBe("County-wide: Hays County");
    expect(signalScopeLabel(parseSignals([fixture[0]])[0])).toBe("This project");
    expect(signalScopeLabel(parseSignals([{ ...cityRecord(), city: "Athens township" }])[0]))
      .toBe("City-wide: Athens township");
    expect(signalScopeLabel(parseSignals([{ ...cityRecord(), city: "Texas City city" }])[0]))
      .toBe("City-wide: Texas City");
    expect(signalScopeLabel(parseSignals([{ ...cityRecord(), city: "Athens City" }])[0]))
      .toBe("City-wide: Athens City");
  });

  it("shows and replays city context without changing the model band", () => {
    const [city] = parseSignals([cityRecord()]);
    const athens = { city: "Athens city", county: "Henderson County", state: "TX", inCityLimits: true };
    const publicationDay = "2026-02-16";
    const before = buildTimeline([city], athensId, "watch", "2026-02-15", athens);
    const after = buildTimeline([city], athensId, "watch", publicationDay, athens);
    expect(before.known).toEqual([]);
    expect(after.known).toMatchObject([{ scope: "city", effect: "context" }]);
    expect(after.evidenceBand).toBe("watch");
    expect(buildTimeline([city], diodeId, "green", publicationDay, { ...athens, inCityLimits: false }).known).toEqual([]);
    const saved = [{ entityId: diodeId, name: "Diode", modelBand: "green" as const,
      savedAt: "2026-02-01T00:00:00Z", ...athens }];
    expect(buildChangeFeed([city], saved, null, "2026-02-01"))
      .toMatchObject([{ signal: { scope: "city" }, transition: null }]);
    expect(buildChangeFeed([city], saved, null))
      .toMatchObject([{ signal: { scope: "city" }, transition: null }]);
    expect(buildChangeFeed([city], [{ ...saved[0], inCityLimits: false }], null, "2026-02-01")).toEqual([]);
  });

  it("fixes the effect for manually reviewed project records while quote-matched submissions stay context", () => {
    expect(parseSignals([fixture[0]])[0]).toMatchObject({ signal_type: "approval_failed", effect: "raise" });
    expect(() => parseSignals([{ ...fixture[0], effect: "context" }])).toThrow();
    expect(parseSignals([{ ...fixture[1], signal_type: "moratorium_enacted", effect: "raise" }])[0].effect).toBe("raise");
    expect(() => parseSignals([{ ...fixture[1], signal_type: "moratorium_enacted", effect: "context" }])).toThrow();
    expect(() => parseSignals([{ ...fixture[1], signal_type: "organized_opposition", effect: "raise" }])).toThrow();
    const submitted = { ...fixture[0], effect: "context", verification: {
      method: "verbatim_match", verified_at: "2026-11-14T11:00:00Z", publication_date_basis: "submitter",
    } };
    expect(parseSignals([submitted])[0]).toMatchObject({ signal_type: "approval_failed", effect: "context" });
    expect(parseSignals([{ ...submitted, signal_type: "moratorium_enacted" }])[0]).toMatchObject({
      signal_type: "moratorium_enacted", effect: "context",
    });
    expect(() => parseSignals([{ ...submitted, effect: "raise" }])).toThrow();
  });
  it.each(["outcome_suspended", "outcome_withdrawn"])("accepts %s only as an outcome effect", (signalType) => {
    const record = { ...fixture[3], signal_type: signalType, effect: "outcome" };
    expect(parseSignals([record])[0]).toMatchObject({ signal_type: signalType, effect: "outcome" });
    expect(() => parseSignals([{ ...record, effect: "raise" }])).toThrow();
    expect(() => parseSignals([{ ...record, effect: "context" }])).toThrow();
  });
  it("requires one explicit scope and keeps county records contextual", () => {
    expect(parseSignals([countyRecord()])[0]).toMatchObject({ scope: "county", county: "Hays County", state: "TX", effect: "context" });
    for (const bad of [
      { ...fixture[0], scope: undefined },
      { ...fixture[0], scope: "county", county: "Hays County", state: "TX" },
      { ...countyRecord(), entity_id: entityId },
      { ...countyRecord(), effect: "raise", signal_type: "approval_failed" },
      { ...countyRecord(), effect: "outcome", signal_type: "outcome_denied" },
      { ...countyRecord(), county: " " },
      { ...countyRecord(), state: " " },
      { ...countyRecord(), scope: "state" },
      { ...countyRecord(), proposed_by: "visitor" },
      { ...countyRecord(), proposed_by: "investigator", verification: {
        method: "verbatim_match", verified_at: "2026-11-14T11:00:00Z", publication_date_basis: "investigator",
      } },
      { ...countyRecord(), verification: {
        method: "verbatim_match", verified_at: "2026-11-14T11:00:00Z", publication_date_basis: "submitter",
      } },
    ]) expect(() => parseSignals([bad])).toThrow();
  });

  it("matches county and state after trimming and case folding, without geography guesses", () => {
    const county = parseSignals([countyRecord()])[0];
    expect(signalAppliesTo(county, sabeyId, { county: " hays county ", state: "tx" })).toBe(true);
    expect(signalAppliesTo(county, cloudburstId, hays)).toBe(true);
    expect(signalAppliesTo(county, sabeyId)).toBe(false);
    expect(signalAppliesTo(county, sabeyId, { county: "Hays", state: "TX" })).toBe(false);
    expect(signalAppliesTo(county, sabeyId, { county: "Hays County", state: "Texas" })).toBe(false);
    expect(signalAppliesTo(county, sabeyId, { county: "Travis County", state: "TX" })).toBe(false);
  });

  it.each([[sabeyId, "red"], [cloudburstId, "green"]] as const)(
    "shows county context for Hays project %s without changing its %s model band", (projectId, modelBand) => {
    const signals = parseSignals([countyRecord()]);
    const before = buildTimeline(signals, projectId, modelBand, "2026-02-15", hays);
    const after = buildTimeline(signals, projectId, modelBand, "2026-02-16", hays);
    expect(before.known).toHaveLength(0);
    expect(before.evidenceBand).toBe(modelBand);
    expect(after.known).toHaveLength(1);
    expect(after.known[0]).toMatchObject({ scope: "county", effect: "context" });
    expect(after.evidenceBand).toBe(modelBand);
    expect(buildTimeline(signals, projectId, modelBand, "2026-02-16", { county: "Travis County", state: "TX" }).known).toEqual([]);
  });

  it("replays the county context to a saved Hays project without a band transition", () => {
    const signals = parseSignals([countyRecord()]);
    const saved = [{ entityId: sabeyId, name: "Sabey", modelBand: "red" as const,
      savedAt: "2026-01-31T12:00:00Z", county: "Hays County", state: "TX" }];
    const entries = buildChangeFeed(signals, saved, null, "2026-02-01");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ entityId: sabeyId, signal: { scope: "county" }, transition: null });
    expect(buildChangeFeed(signals, [{ ...saved[0], county: "Travis County" }], null, "2026-02-01")).toEqual([]);
  });
  it("accepts investigator provenance only with quote-matched context and an AI-attributed date", () => {
    const proposed = { ...fixture[1], proposed_by: "investigator", verification: {
      method: "verbatim_match", verified_at: "2026-11-14T11:00:00Z", publication_date_basis: "investigator",
    } };
    expect(parseSignals([proposed])[0]).toMatchObject({ proposed_by: "investigator", effect: "context" });
    for (const bad of [{ ...proposed, effect: "raise" }, { ...proposed, signal_type: "outcome_denied", effect: "outcome" },
      { ...proposed, verification: { ...proposed.verification, method: "manual_review" } },
      { ...proposed, verification: { ...proposed.verification, publication_date_basis: "submitter" } },
      { ...proposed, proposed_by: "visitor" }, { ...proposed, proposed_by: undefined }, { ...proposed, proposed_by: "unknown" }]) {
      expect(() => parseSignals([bad])).toThrow();
    }
    expect(parseSignals([{ ...proposed, proposed_by: "visitor", verification: { ...proposed.verification, publication_date_basis: "submitter" } }])[0].proposed_by).toBe("visitor");
  });
  it("requires meaningful verification metadata and keeps submitted records contextual", () => {
    const submitted = { ...fixture[1], recorded_at: "2026-11-14T11:00:00.125Z", verification: {
      method: "verbatim_match", verified_at: "2026-11-14T11:00:00.125Z", publication_date_basis: "submitter",
    } };
    expect(parseSignals([submitted])[0].verification).toEqual(submitted.verification);
    for (const verification of [undefined, null, [], {}, { ...submitted.verification, method: "llm" },
      { ...submitted.verification, verified_at: "invalid" }, { ...submitted.verification, publication_date_basis: "inferred" }]) {
      expect(() => parseSignals([{ ...submitted, verification }])).toThrow();
    }
    expect(() => parseSignals([{ ...submitted, signal_type: "approval_failed", effect: "raise" }])).toThrow();
    expect(() => parseSignals([{ ...submitted, verification: { ...submitted.verification, publication_date_basis: "source_page" } }])).toThrow();
    expect(() => parseSignals([{ ...submitted, published_precision: "minute", published_at: "2026-02-18T11:38:00Z" }])).toThrow();
  });

  it("a quote-matched context record cannot change the evidence level or dollar scenario", () => {
    const submitted = parseSignals([{ ...fixture[1], verification: {
      method: "verbatim_match", verified_at: "2026-11-14T11:00:00Z", publication_date_basis: "submitter",
    } }]);
    const before = buildTimeline([], entityId, "watch");
    const after = buildTimeline(submitted, entityId, "watch");
    expect(after.evidenceBand).toBe(before.evidenceBand);
    const rates = parseModelCard(artifact).metrics.band_outcomes_oof;
    expect(stoppedShareForBand(after.modelBand, rates)).toBe(stoppedShareForBand(before.modelBand, rates));
    expect(economics(stoppedShareForBand(after.modelBand, rates), 100)).toEqual(economics(stoppedShareForBand(before.modelBand, rates), 100));
  });
  it("never backdates newly submitted evidence into an earlier timeline or retrospective replay", () => {
    const submitted = parseSignals([{ ...fixture[1], recorded_at: "2026-11-15T01:00:00Z", verification: {
      method: "verbatim_match", verified_at: "2026-11-15T01:00:00Z", publication_date_basis: "submitter",
    } }]);
    expect(buildTimeline(submitted, entityId, "watch", "2026-11-13").known).toEqual([]);
    expect(buildTimeline(submitted, entityId, "watch", "2026-11-14").known).toHaveLength(1);
    const saved = [{ entityId, name: "San Marcos", modelBand: "watch" as const, savedAt: "2026-11-14T20:00:00Z" }];
    expect(buildChangeFeed(submitted, saved, null)).toHaveLength(1);
    expect(buildChangeFeed(submitted, saved, null)[0].timelineDay).toBe("2026-11-14");
    expect(buildChangeFeed(submitted, saved, null, "2025-01-01")).toEqual([]);
  });
  it.each([
    { published_at: undefined }, { quote: "x".repeat(301) }, { signal_type: "rumor" }, { check_id: "finance" },
    { effect: "clear" }, { published_at: "2026-02-30", published_precision: "day" },
    { published_at: "2026-02-18T11:38:00", published_precision: "minute" },
    { source_url: "javascript:alert(1)" }, { entity_id: "not-a-project-id" },
    { event_precision: "unknown", event_at: "2026-02-18" }, { recorded_at: "invalid" },
    { signal_type: "outcome_denied", effect: "raise" }, { summary: "" },
    { signal_id: "trailing-newline\n" }, { entity_id: `${entityId}\n` },
    { recorded_at: "2026-11-14T09:11:18Z\n" },
  ])("rejects an invalid source record %j", (override) => {
    expect(() => parseSignals([{ ...fixture[0], ...override }])).toThrow();
  });
  it("rejects malformed collections and duplicate IDs", () => {
    expect(() => parseSignals(null)).toThrow();
    expect(() => parseSignals([null])).toThrow();
    expect(() => parseSignals([fixture[0], fixture[0]])).toThrow(/duplicate/i);
  });
  it("supports an explicitly unknown event date without inventing a time", () => {
    expect(parseSignals([{ ...fixture[0], event_at: null, event_precision: "unknown" }])[0].event_at).toBeNull();
  });
});
