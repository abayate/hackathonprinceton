import { describe, expect, it } from "vitest";
import { BAND_COLOR } from "./model";
import { buildMapPins, getAvailableMapPinId } from "./mapPins";

describe("buildMapPins", () => {
  it("builds pins for coordinates within geographic bounds, preserving zeroes and unscored projects", () => {
    const projects = Object.freeze([
      Object.freeze({ project_id: "green-project", name: "Green Project", lat: 30, lng: -97, band: "green" as const, p_stopped: 0.396 }),
      Object.freeze({ project_id: "watch-project", name: "Watch Project", lat: 0, lng: 0, band: "watch" as const, p_stopped: 0.596 }),
      Object.freeze({ project_id: "red-project", name: "Red Project", lat: 31, lng: -96, band: "red" as const, p_stopped: 0.82 }),
      Object.freeze({ project_id: "unknown-score", name: "Unknown Score", lat: 32, lng: -95, band: null, p_stopped: null }),
      Object.freeze({ project_id: "unscored-red-band", name: "Unscored Red Band", lat: 33, lng: -94, band: "red" as const, p_stopped: null }),
      Object.freeze({ project_id: "bad-latitude", name: "Bad Latitude", lat: Number.NaN, lng: -95, band: "green" as const, p_stopped: 0.2 }),
      Object.freeze({ project_id: "bad-longitude", name: "Bad Longitude", lat: 32, lng: Number.POSITIVE_INFINITY, band: "red" as const, p_stopped: 0.8 }),
      Object.freeze({ project_id: "latitude-out-of-range", name: "Invalid Latitude", lat: 91, lng: 10, band: "green" as const, p_stopped: 0.2 }),
      Object.freeze({ project_id: "longitude-out-of-range", name: "Invalid Longitude", lat: 30, lng: -181, band: "red" as const, p_stopped: 0.8 }),
    ]);

    expect(buildMapPins(projects)).toEqual([
      { id: "green-project", name: "Green Project", lat: 30, lng: -97, color: BAND_COLOR.green, text: "39/100" },
      { id: "watch-project", name: "Watch Project", lat: 0, lng: 0, color: BAND_COLOR.watch, text: "59/100" },
      { id: "red-project", name: "Red Project", lat: 31, lng: -96, color: BAND_COLOR.red, text: "82/100" },
      { id: "unknown-score", name: "Unknown Score", lat: 32, lng: -95, color: BAND_COLOR.none, text: "Unscored" },
      { id: "unscored-red-band", name: "Unscored Red Band", lat: 33, lng: -94, color: BAND_COLOR.none, text: "Unscored" },
    ]);
    expect(projects).toHaveLength(9);
  });
});

describe("getAvailableMapPinId", () => {
  const pins = [
    { id: "one", name: "One", lat: 1, lng: 1, color: "gray", text: "Unscored" },
    { id: "two", name: "Two", lat: 2, lng: 2, color: "gray", text: "20/100" },
  ];

  it("keeps a selection that still has a pin and otherwise chooses the first available pin", () => {
    expect(getAvailableMapPinId("two", pins)).toBe("two");
    expect(getAvailableMapPinId("removed", pins)).toBe("one");
    expect(getAvailableMapPinId(null, pins)).toBe("one");
    expect(getAvailableMapPinId("removed", [])).toBeNull();
  });
});
