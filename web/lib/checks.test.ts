import { describe, expect, it } from "vitest";
import { checksFor, checksForListing } from "./checks";
import type { Site } from "./sites";
import type { Listing } from "./listings";

const site = {
  p_stopped: 0.42,
  nearest_metro: "Austin",
  km_to_nearest_metro: 40,
  county_tracked_projects: 3,
  county: "Example County",
  water_stress_label: "High",
} as Site;

const listing = {
  p_stopped: 0.42,
  state: "TX",
  km_to_metro: 40,
  nearest_metro: "Austin",
  county_tracked_projects: 3,
  county: "Example County",
  county_density: 12,
  water_stress_label: "High",
} as Listing;

describe("model-backed opposition check copy", () => {
  it("does not claim water stress drives a Texas project score", () => {
    const check = checksFor(site).find(({ id }) => id === "opposition");
    expect(check?.detail).not.toMatch(/water stress/i);
    expect(check?.basis).not.toMatch(/16 stopped|86 under-construction|AUC/i);
    expect(check?.sources).toContainEqual({ label: "Model card and evaluation", url: "/evidence" });
  });

  it("does not claim water stress, fixed sample counts, or a fixed AUC drive listing scores", () => {
    const check = checksForListing(listing).find(({ id }) => id === "opposition");
    expect(check?.detail).not.toMatch(/water stress/i);
    expect(check?.basis).not.toMatch(/16 stopped|86 under-construction|AUC/i);
    expect(check?.sources).toContainEqual({ label: "Model card and evaluation", url: "/evidence" });
  });

  it("covers every tracker check status path using reported inputs", () => {
    const base = {
      ...site,
      in_city_limits: false,
      city: "Example City",
      land_acres: 0,
      water_stress_label: "Low",
    } as Site;
    const checks = checksFor(base);
    expect(checks.find(({ id }) => id === "water")?.status).toBe("pass");
    expect(checks.find(({ id }) => id === "zoning")?.status).toBe("pass");
    expect(checks.find(({ id }) => id === "land")?.status).toBe("unknown");
    expect(checks.find(({ id }) => id === "policy")?.sources).toHaveLength(1);

    expect(checksFor({ ...base, water_stress_label: null } as Site).find(({ id }) => id === "water")?.status).toBe("unknown");
    expect(checksFor({ ...base, water_stress_label: "Extremely High" } as Site).find(({ id }) => id === "water")?.status).toBe("fail");
    expect(checksFor({ ...base, water_stress_label: "Medium" } as Site).find(({ id }) => id === "water")?.status).toBe("watch");
    expect(checksFor({ ...base, water_stress_label: "Arid" } as Site).find(({ id }) => id === "water")?.status).toBe("watch");
    expect(checksFor({ ...base, water_stress_label: "High" } as Site).find(({ id }) => id === "water")?.status).toBe("fail");
    expect(checksFor({ ...base, water_stress_label: "Low-medium" } as Site).find(({ id }) => id === "water")?.status).toBe("pass");
    expect(checksFor({ ...base, in_city_limits: null } as Site).find(({ id }) => id === "zoning")?.status).toBe("unknown");
    expect(checksFor({ ...base, in_city_limits: true } as Site).find(({ id }) => id === "zoning")?.detail).toContain("city council vote");
    expect(checksFor({ ...base, p_stopped: null } as Site).find(({ id }) => id === "opposition")?.detail).toContain("No model score");
    expect(checksFor({ ...base, p_stopped: 0.6 } as Site).find(({ id }) => id === "opposition")?.status).toBe("fail");
    expect(checksFor({ ...base, p_stopped: 0.4 } as Site).find(({ id }) => id === "opposition")?.status).toBe("watch");
    expect(checksFor({ ...base, p_stopped: 0.1 } as Site).find(({ id }) => id === "opposition")?.status).toBe("pass");
    expect(checksFor({ ...base, land_acres: 15 } as Site).find(({ id }) => id === "land")?.status).toBe("pass");
  });

  it("covers listing check statuses, missing facts, and both policy branches", () => {
    const base = {
      ...listing,
      heavy_power: true,
      water_stress_label: null,
      in_city_limits: null,
      place: "Example City",
      zoning: null,
      lot_acres: 0,
      building_sf: null,
      ceiling_ft: null,
      column_width_ft: null,
    } as Listing;
    const checks = checksForListing(base);
    expect(checks.find(({ id }) => id === "power")?.status).toBe("pass");
    expect(checks.find(({ id }) => id === "water")?.status).toBe("unknown");
    expect(checks.find(({ id }) => id === "zoning")?.status).toBe("unknown");
    expect(checks.find(({ id }) => id === "policy")?.status).toBe("watch");
    expect(checks.find(({ id }) => id === "land")?.status).toBe("unknown");

    expect(checksForListing({ ...base, state: "CA" } as Listing).find(({ id }) => id === "policy")?.status).toBe("unknown");
    expect(checksForListing({ ...base, heavy_power: false } as Listing).find(({ id }) => id === "power")?.status).toBe("watch");
    expect(checksForListing({ ...base, heavy_power: null } as Listing).find(({ id }) => id === "power")?.status).toBe("unknown");
    expect(checksForListing({ ...base, water_stress_label: "Medium" } as Listing).find(({ id }) => id === "water")?.status).toBe("watch");
    expect(checksForListing({ ...base, water_stress_label: "High" } as Listing).find(({ id }) => id === "water")?.status).toBe("fail");
    expect(checksForListing({ ...base, in_city_limits: true, zoning: "Industrial" } as Listing).find(({ id }) => id === "zoning")?.detail).toContain("Zoned Industrial");
    expect(checksForListing({ ...base, in_city_limits: false } as Listing).find(({ id }) => id === "zoning")?.status).toBe("pass");
    expect(checksForListing({ ...base, p_stopped: null, model_note: "Missing location" } as Listing).find(({ id }) => id === "opposition")?.detail).toBe("Missing location");
    expect(checksForListing({ ...base, p_stopped: null, model_note: null } as Listing).find(({ id }) => id === "opposition")?.detail).toBe("Not scored.");
    expect(checksForListing({ ...base, p_stopped: 0.6, county_density: null } as Listing).find(({ id }) => id === "opposition")?.status).toBe("fail");
    expect(checksForListing({ ...base, p_stopped: 0.4 } as Listing).find(({ id }) => id === "opposition")?.status).toBe("watch");
    expect(checksForListing({ ...base, p_stopped: 0.1 } as Listing).find(({ id }) => id === "opposition")?.status).toBe("pass");
    expect(checksForListing({ ...base, lot_acres: 6, building_sf: 1000, ceiling_ft: 20, column_width_ft: 25 } as Listing).find(({ id }) => id === "land")?.status).toBe("pass");
    expect(checksForListing({ ...base, lot_acres: 3 } as Listing).find(({ id }) => id === "land")?.status).toBe("watch");
  });
});

describe("dated record counts", () => {
  it("counts city context only for projects inside the matching city, county, and state", () => {
    const citySignal = {
      signal_id: "city-ordinance", scope: "city", city: " Athens city ", county: " Henderson County ", state: "tx",
      check_id: "policy", signal_type: "ordinance_enacted", effect: "context",
      event_at: "2026-08-24", event_precision: "day", published_at: "2026-08-25", published_precision: "day",
      recorded_at: "2026-11-14T12:00:00Z", source_name: "KLTV", source_url: "https://example.org/athens",
      quote: "The Athens city council approved an ordinance restricting data centers inside city limits.",
      summary: "Citywide ordinance, not a project vote.",
      verification: { method: "manual_review", verified_at: "2026-11-14T12:00:00Z", publication_date_basis: "source_page" },
    } as unknown as import("./signals").Signal;
    const athens = { ...site, project_id: "athens-project", city: "Athens city", county: "Henderson County",
      in_city_limits: true } as Site;
    const count = (project: Site) => checksFor(project, [citySignal]).find((check) => check.id === "policy")?.datedRecordCount;
    expect(count(athens)).toBe(1);
    expect(count({ ...athens, in_city_limits: false })).toBe(0);
    expect(count({ ...athens, in_city_limits: null })).toBe(0);
    expect(count({ ...athens, city: null })).toBe(0);
    expect(count({ ...athens, city: "Mabank" })).toBe(0);
    expect(count({ ...athens, county: "Travis County" })).toBe(0);
    expect(checksFor(athens, [citySignal]).map((check) => check.status)).toEqual(checksFor(athens).map((check) => check.status));
  });

  it("counts matching records on their check without changing a check status", async () => {
    const { parseSignals, buildTimeline } = await import("./signals");
    const fixture = (await import("../../data/signals/risk_signals.json")).default;
    const signals = parseSignals(fixture);
    const hays = { ...site, project_id: "4ed87767-70bd-4287-9af6-bff25ef45241", county: "Hays County" } as Site;
    const known = buildTimeline(signals, hays.project_id, "red", "2026-02-16", { county: hays.county, state: "TX" }).known;
    const checks = checksFor(hays, known);
    expect(checks.find((check) => check.id === "water")?.datedRecordCount).toBe(1);
    expect(checks.filter((check) => check.id !== "water").every((check) => check.datedRecordCount === 0)).toBe(true);
    expect(checks.map((check) => check.status)).toEqual(checksFor(hays).map((check) => check.status));
    expect(checksFor({ ...hays, county: "Travis County" }, known).every((check) => check.datedRecordCount === 0)).toBe(true);
    const before = buildTimeline(signals, hays.project_id, "red", "2026-02-15", { county: hays.county, state: "TX" }).known;
    expect(checksFor(hays, before).every((check) => check.datedRecordCount === 0)).toBe(true);
  });

  it("does not change any public project's score, band, economics, or check status", async () => {
    const fs = await import("node:fs");
    const { buildPublicDataset } = await import("./publicData");
    const { parseSignals } = await import("./signals");
    const { parseModelCard } = await import("./modelCard");
    const { economics, stoppedShareForBand } = await import("./model");
    const rawModel = JSON.parse(fs.readFileSync(new URL("../../data/model/risk_model.json", import.meta.url), "utf8"));
    const model = parseModelCard(rawModel);
    const sites = buildPublicDataset(
      fs.readFileSync(new URL("../../data/labels/tx_projects.csv", import.meta.url), "utf8"),
      fs.readFileSync(new URL("../../data/features/tx_project_features.csv", import.meta.url), "utf8"), rawModel,
    ).sites;
    const signals = parseSignals((await import("../../data/signals/risk_signals.json")).default);
    const before = structuredClone(sites);
    const baseline = sites.map((project) => ({
      score: project.p_stopped, band: project.band,
      economics: economics(stoppedShareForBand(project.band, model.metrics.band_outcomes_oof), 100),
      statuses: checksFor(project).map((check) => check.status),
    }));
    expect(sites).toHaveLength(349);
    const after = sites.map((project) => ({
      score: project.p_stopped, band: project.band,
      economics: economics(stoppedShareForBand(project.band, model.metrics.band_outcomes_oof), 100),
      statuses: checksFor(project, signals).map((check) => check.status),
    }));
    expect(after).toEqual(baseline);
    expect(sites).toEqual(before);
  });
});
