import { describe, expect, it } from "vitest";
import { CHECK_TERMS, highlightPassage, passagesFor } from "./sourceReading";
import type { SourceCheck } from "./sourceMonitorTypes";

function reading(texts: string[], sourceId = "source-a", outcome: SourceCheck["outcome"] = "ok"): SourceCheck {
  return { sourceId, outcome, fetchedAt: "2026-11-14T12:00:00.000Z",
    paragraphs: texts.map((text, i) => ({ hash: i.toString(16).padStart(16, "0"), text })) };
}

describe("reading source passages by check", () => {
  it("covers the seven checks with visible literal terms", () => {
    expect(Object.keys(CHECK_TERMS)).toEqual(["power", "water", "zoning", "opposition", "policy", "land", "labor"]);
    const passages = passagesFor([reading([
      "The GRID needs review.", "An aquifer supplies the area.", "The planning commission will meet.",
      "Residents signed a petition.", "The tax abatement is under review.", "The parcel has wetlands.",
      "The contractor discussed workforce availability.",
    ])]);
    expect(passages.map((passage) => passage.checkId)).toEqual(Object.keys(CHECK_TERMS));
    expect(passages[0]).toMatchObject({ sourceId: "source-a", hash: "0000000000000000", terms: ["grid"],
      text: "The GRID needs review.", fetchedAt: "2026-11-14T12:00:00.000Z" });
  });

  it("matches whole words without matching inside ASCII or Unicode words", () => {
    const passages = passagesFor([reading([
      "empowered watermelon permitter jobsite grid2 2grid égrid gridé 水water water水 grid\u0301",
      "POWER, (water), grid-connected, 100 MW and rezoning.",
    ])]);
    expect(passages.every((passage) => passage.hash === "0000000000000001")).toBe(true);
    expect(passages.map((passage) => passage.checkId)).toEqual(["power", "water", "zoning"]);
    expect(passages[0].terms).toEqual(["power", "grid", "MW"]);
  });

  it("assigns a passage to multiple checks without treating it as a finding", () => {
    const text = "No water shortage was reported; residents asked about a permit and power.";
    const passages = passagesFor([reading([text])]);
    expect(passages.map((passage) => passage.checkId)).toEqual(["power", "water", "zoning", "opposition"]);
    expect(passages.every((passage) => passage.text === text && !("status" in passage))).toBe(true);
  });

  it("deduplicates source/hash/check while preserving identical text from distinct sources", () => {
    const a = reading(["Water and power need follow-up."]);
    const b = reading(["Water and power need follow-up."], "source-b");
    const passages = passagesFor([a, { ...a, paragraphs: [...a.paragraphs, ...a.paragraphs] }, b]);
    expect(passages.map(({ sourceId, checkId }) => `${sourceId}:${checkId}`))
      .toEqual(["source-a:power", "source-a:water", "source-b:power", "source-b:water"]);
  });

  it("keeps source and page order and applies each check's limit independently", () => {
    const passages = passagesFor([
      reading(["Water A", "No match", "Water B", "Water C", "Water D", "Power A"]),
      reading(["Water E", "Power B"], "source-b"),
    ]);
    expect(passages.map((passage) => passage.text)).toEqual(["Water A", "Water B", "Water C", "Power A", "Power B"]);
    expect(passagesFor([reading(["Water A", "Water B", "Power A"])], 1).map((p) => p.text))
      .toEqual(["Water A", "Power A"]);
  });

  it("honors zero, caps requests at twelve and defaults invalid limits to three", () => {
    const checks = [reading(Array.from({ length: 20 }, (_, i) => `Water passage ${i}`))];
    expect(passagesFor(checks, 0)).toEqual([]);
    expect(passagesFor(checks, 99)).toHaveLength(12);
    for (const limit of [-1, 1.5, NaN, Infinity]) expect(passagesFor(checks, limit)).toHaveLength(3);
  });

  it("ignores failed checks, handles no readings and never modifies inputs", () => {
    const checks = [reading(["Water"], "failed", "unreachable"), reading(["Power"], "not-text", "not_text"),
      reading(["No terms here"]), reading(["Water"], "good")];
    const before = structuredClone(checks);
    checks.forEach((check) => { check.paragraphs.forEach(Object.freeze); Object.freeze(check.paragraphs); Object.freeze(check); });
    expect(passagesFor(Object.freeze(checks)).map((p) => p.sourceId)).toEqual(["good"]);
    expect(checks).toEqual(before);
    expect(passagesFor([])).toEqual([]);
  });
});

describe("safe matching highlights", () => {
  it("returns text pieces with exact reconstruction, including untrusted markup", () => {
    const text = '<img src=x onerror="alert(1)"> WATER & water; watermelon.';
    const parts = highlightPassage(text, ["water"]);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.filter((part) => part.matched).map((part) => part.text)).toEqual(["WATER", "water"]);
    expect(parts[0]).toEqual({ text: '<img src=x onerror="alert(1)"> ', matched: false });
  });

  it("uses the same Unicode boundaries for highlighted and extracted terms", () => {
    const text = "éwater wateré 水water water水 water\u0301 WATER—water.";
    const passage = passagesFor([reading([text])])[0];
    expect(highlightPassage(passage.text, passage.terms).filter((part) => part.matched).map((part) => part.text))
      .toEqual(["WATER", "water"]);
  });

  it("handles phrases, overlapping terms and repeated terms without duplicated text", () => {
    const text = "The PLANNING   COMMISSION discussed tax abatement and tax.";
    expect(passagesFor([reading([text])]).map((p) => p.checkId)).toEqual(["zoning", "policy"]);
    const parts = highlightPassage(text, ["planning commission", "commission", "tax", "tax abatement", "tax"]);
    expect(parts.filter((part) => part.matched).map((part) => part.text))
      .toEqual(["PLANNING   COMMISSION", "tax abatement", "tax"]);
    expect(parts.map((part) => part.text).join("")).toBe(text);
  });

  it("escapes regex punctuation and ignores empty terms", () => {
    const text = "A c++ project, [grid], and a.b; axb is different.";
    const terms = Object.freeze(["c++", "[grid]", "a.b", "", "  "]);
    expect(highlightPassage(text, terms).filter((part) => part.matched).map((part) => part.text))
      .toEqual(["c++", "[grid]", "a.b"]);
    expect(highlightPassage("Unmatched", ["water"])).toEqual([{ text: "Unmatched", matched: false }]);
    expect(highlightPassage("Water", [])).toEqual([{ text: "Water", matched: false }]);
    expect(highlightPassage("", ["water"])).toEqual([]);
  });

  it("handles matches at both edges with no empty text fragments", () => {
    expect(highlightPassage("Water", ["water"])).toEqual([{ text: "Water", matched: true }]);
    expect(highlightPassage("Water/power", ["water", "power"])).toEqual([
      { text: "Water", matched: true }, { text: "/", matched: false }, { text: "power", matched: true },
    ]);
  });
});
