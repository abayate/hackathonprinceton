import { describe, expect, it } from "vitest";
import { isClientId, isWatchlistId, parseAsOf, parseMaxWaterStress, parseMinAcres, parseMw } from "./params";

describe("visitor and water filters", () => {
  it.each(["04c5d573-d357-476f-9ef7-99980f476023", "04C5D573-D357-476F-9EF7-99980F476023"])("accepts UUID %s", (id) => expect(isClientId(id)).toBe(true));
  it.each([undefined, null, {}, [], "", "visitor-123", "04c5d573-d357-476f-9ef7-99980f476023\n"])("rejects invalid visitor %j", (id) => expect(isClientId(id)).toBe(false));
  it.each([["0", 0], ["2.5", 2.5], [5, 5]])("parses maximum water stress %s", (value, expected) => expect(parseMaxWaterStress(value)).toBe(expected));
  it.each(["-1", "6", "garbage", [], Infinity, null])("ignores invalid maximum water stress %j", (v) => expect(parseMaxWaterStress(v)).toBeUndefined());
});

describe("parseAsOf", () => {
  it.each(["2025-08-20", "2026-02-18", "2024-02-29"])("accepts a real calendar day %s", (value) => expect(parseAsOf(value)).toBe(value));
  it.each([undefined, null, [], ["2026-02-18"], "", "2026-2-18", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "2026-02-18T00:00:00Z", " 2026-02-18", "0000-01-01", 20260218])(
    "rejects an invalid calendar day %j", (value) => expect(parseAsOf(value)).toBeUndefined(),
  );
});

describe("parseMw", () => {
  it.each([undefined, null, "", "  ", "foo", "NaN", "Infinity", "-Infinity", "1e400", [], ["25"], {}, true, Infinity, NaN])(
    "uses the default for invalid input %j", (input) => expect(parseMw(input)).toBe(100),
  );
  it.each([["0", 1], ["-5", 1], ["0.5", 1], ["1", 1], ["25.5", 25.5], ["5000", 5000], ["6000", 5000], [100, 100], [" 42 ", 42]])(
    "bounds %j to %j MW", (input, result) => expect(parseMw(input)).toBe(result),
  );
});

describe("parseMinAcres", () => {
  it.each([undefined, null, "", " ", "foo", "-1", "Infinity", "1e400", [], ["5"], {}, true, NaN])(
    "omits an invalid filter %j", (input) => expect(parseMinAcres(input)).toBeUndefined(),
  );
  it.each([["0", 0], ["12.5", 12.5], [" 5 ", 5], [3, 3]])(
    "keeps a valid minimum %j", (input, result) => expect(parseMinAcres(input)).toBe(result),
  );
});

describe("isWatchlistId", () => {
  it.each(["costar-123456", "04c5d573-d357-476f-9ef7-99980f476023", "a_1-Z", "x".repeat(100)])(
    "accepts a supported ID %s", (input) => expect(isWatchlistId(input)).toBe(true),
  );
  it.each([undefined, null, 1, {}, [], "", " ", "costar-1\n", "a/b", "x' OR 1=1", "a.b", "é", "x".repeat(101)])(
    "rejects an invalid ID %j", (input) => expect(isWatchlistId(input)).toBe(false),
  );
});
