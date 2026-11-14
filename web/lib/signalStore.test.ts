import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getSignals } from "./signalStore";
import { signalAppliesTo } from "./signals";

describe("public signal fixture loading", () => {
  it("loads ten reviewed records, including one city context record for both Athens projects", async () => {
    const signals = await getSignals();
    expect(signals).toHaveLength(10);
    expect(signals.filter(s => s.scope === "project")).toHaveLength(8);
    expect(signals.filter(s => s.scope === "county")).toMatchObject([{county:"Hays County",state:"TX",effect:"context"}]);
    expect(signals.filter(s => s.scope === "city")).toMatchObject([{ signal_id: "athens-city-ordinance-enacted-2026-08",
      city: "Athens city", county: "Henderson County", state: "TX",
      signal_type: "ordinance_enacted", effect: "context", check_id: "policy",
      published_at: "2026-08-24T20:40:00-04:00", event_at: null, event_precision: "unknown",
      verification: { method: "manual_review", publication_date_basis: "source_page" } }]);
    expect(signals.filter(s => signalAppliesTo(s,"1c23acb7-4ec3-459b-aa99-1bd3104a4fb9",{county:"Hays County",state:"TX"}))).toHaveLength(4);
    for (const [projectId, count] of [
      ["53035780-aaef-4edb-b279-eb8e2b5cc470", 2],
      ["6251ccd6-f245-4bf4-bdf1-118825fa3123", 1],
    ] as const) {
      expect(signals.filter((s) => signalAppliesTo(s, projectId, { city: "Athens city", county: "Henderson County",
        state: "TX", inCityLimits: true }))).toHaveLength(count);
    }
    expect(signals.filter((s) => s.effect === "outcome")).toHaveLength(3);
    expect(signals.every((s) => s.source_url.startsWith("https://") && s.quote.length <= 300)).toBe(true);
  });
});
