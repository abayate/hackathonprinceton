import { describe, expect, it } from "vitest";
import type { Site } from "./sites";
import type { Signal } from "./signals";
import type { MonitorState, SourceCheck, WatchedSource } from "./sourceMonitorTypes";
import { applyCheck, parseMonitorState, parseSourceCheck, toParagraphs, watchedSourcesFor } from "./sourceMonitor";

const PROJECT = "90000000-0000-4000-8000-000000000001";
const OTHER = "90000000-0000-4000-8000-000000000002";
const site = {
  project_id: PROJECT, primary_source_url: "https://example.com/primary", primary_source_name: "Primary report",
  tracker_url: `https://morethanjustparks.com/data-center-tracker/synthetic--${PROJECT}`,
} as Site;
const signal = {
  scope: "project", entity_id: PROJECT, source_url: "https://example.com/record", source_name: "Project record",
  published_at: "2026-01-02", published_precision: "day", summary: "A synthetic report",
} as Signal;
const goodParagraph = "The synthetic project council discussed a new proposal after several public hearings and requested further review.";

function watched(): WatchedSource { return watchedSourcesFor(site, [signal])[0]; }
function check(sourceId: string, outcome: SourceCheck["outcome"], text: string[] = [],
  fetchedAt = "2026-11-14T12:00:00.000Z"): SourceCheck {
  return { sourceId, outcome, fetchedAt, paragraphs: text.map((value) => toParagraphs(value, "text/plain")[0]) };
}

describe("source monitor engine", () => {
  it("watches only safe primary, per-project tracker and exact project record URLs", () => {
    const county = { ...signal, scope: "county", county: "Hays County", state: "TX",
      source_url: "https://example.com/county" } as unknown as Signal;
    const other = { ...signal, entity_id: OTHER, source_url: "https://example.com/other" } as Signal;
    const duplicate = { ...signal, source_url: "https://example.com/primary" } as Signal;
    const sources = watchedSourcesFor(site, [signal, county, other, duplicate]);
    expect(sources.map((s) => s.kind)).toEqual(["primary", "tracker", "record"]);
    expect(sources.map((s) => s.url)).toEqual([site.primary_source_url, site.tracker_url, signal.source_url]);
    expect(sources.map((s) => s.publishedAt)).toEqual(["2026-01-02", null, "2026-01-02"]);
    expect(sources.every((s) => s.projectId === PROJECT && new RegExp(`^${PROJECT}:[a-f0-9]{16}$`).test(s.id))).toBe(true);
    expect(watchedSourcesFor(site, [signal, county, other, duplicate])).toEqual(sources);
  });

  it("rejects unsafe URLs and a tracker page not tied to the project", () => {
    const sources = watchedSourcesFor({ ...site, primary_source_url: "http://example.com/insecure",
      tracker_url: `https://morethanjustparks.com/data-center-tracker/other--${OTHER}` },
    [{ ...signal, source_url: "https://user:pass@example.com/secret" } as Signal]);
    expect(sources).toEqual([]);
    expect(watchedSourcesFor({ ...site, primary_source_url: "https://example.com:8443/custom" }, [])
      .some((source) => source.kind === "primary")).toBe(false);
  });

  it("extracts unique long visible paragraphs with block boundaries and no hidden markup", () => {
    const body = `<html><head><title>${goodParagraph}</title></head><body><input hidden value="not visible"><p>${goodParagraph}</p>
      <script>${goodParagraph}</script><div hidden><p>${"Hidden and not visible. ".repeat(6)}</p></div>
      <p>short</p><p>${goodParagraph}</p><p>${"A second visible paragraph with enough detail to be retained. ".repeat(2)}</p></body></html>`;
    const paragraphs = toParagraphs(body, "text/html; charset=utf-8");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].text).toBe(goodParagraph);
    expect(paragraphs.every((p) => p.text.length >= 60 && p.text.length <= 600 && /^[a-f0-9]{16}$/.test(p.hash))).toBe(true);
    expect(paragraphs.some((p) => p.text.includes("Hidden"))).toBe(false);
  });

  it("hashes full normalized text before truncation and bounds paragraph count", () => {
    const a = `${"Long visible source passage. ".repeat(25)}A`;
    const b = `${"Long visible source passage. ".repeat(25)}B`;
    const paragraphs = toParagraphs(`${a}\n\n${b}`, "text/plain");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].text).toBe(paragraphs[1].text);
    expect(paragraphs[0].hash).not.toBe(paragraphs[1].hash);
    const many = Array.from({ length: 125 }, (_, i) => `Paragraph ${i}: ${goodParagraph}`).join("\n\n");
    expect(toParagraphs(many, "text/plain")).toHaveLength(120);
    expect(toParagraphs(goodParagraph, "application/pdf")).toEqual([]);
  });

  it("baselines the first successful check after failure, then detects only unseen text", () => {
    const source = watched();
    const failed = applyCheck(null, check(source.id, "unreachable"), ["synthetic project"], source);
    expect(failed.status).toBe("unreachable");
    expect(failed.snapshot.lastOkAt).toBeNull();
    const first = applyCheck(failed.snapshot, check(source.id, "ok", [goodParagraph], "2026-11-14T12:01:00.000Z"),
      ["synthetic project"], source);
    expect(first.status).toBe("baseline");
    expect(first.snapshot.pending).toEqual([]);
    const second = applyCheck(first.snapshot, check(source.id, "ok", [goodParagraph], "2026-11-14T12:02:00.000Z"),
      ["synthetic project"], source);
    expect(second.status).toBe("unchanged");
    const fresh = `${goodParagraph} The company added another new paragraph about local review.`;
    const third = applyCheck(second.snapshot, check(source.id, "ok", [fresh], "2026-11-14T12:03:00.000Z"),
      ["synthetic project"], source);
    expect(third.status).toBe("new_text");
    expect(third.snapshot.pending[0].text).toContain("company added");
    expect(third.snapshot.pending[0].mentions).toEqual(["synthetic project"]);
    expect(third.snapshot.lastChangedAt).toBe("2026-11-14T12:03:00.000Z");
    expect(second.snapshot.pending).toEqual([]);
    const unreachable = applyCheck(third.snapshot, check(source.id, "unreachable", [], "2026-11-14T12:04:00.000Z"),
      [], source);
    expect(unreachable.status).toBe("unreachable");
    expect(unreachable.snapshot.pending).toEqual(third.snapshot.pending);
    expect(unreachable.snapshot.seenHashes).toEqual(third.snapshot.seenHashes);
    expect(unreachable.snapshot.lastOkAt).toBe(third.snapshot.lastOkAt);
  });

  it("keeps a pending paragraph's hash when the seen-history limit is reached", () => {
    const source = watched();
    const baseline = applyCheck(null, check(source.id, "ok", [goodParagraph]), [], source).snapshot;
    const pending = { hash: baseline.seenHashes[0], text: goodParagraph, mentions: [],
      foundAt: baseline.lastCheckedAt };
    const old = { ...baseline, seenHashes: [pending.hash,
      ...Array.from({ length: 510 }, (_, i) => (i + 1).toString(16).padStart(16, "0"))], pending: [pending] };
    const fresh = [
      `${goodParagraph} First new text at the end of the monitored source.`,
      `${goodParagraph} Second new text at the end of the monitored source.`,
    ];
    const result = applyCheck(old, check(source.id, "ok", fresh, "2026-11-14T12:05:00.000Z"), [], source);
    expect(result.snapshot.seenHashes).toHaveLength(512);
    expect(result.snapshot.seenHashes).toContain(pending.hash);
    expect(parseMonitorState({ version: 1, autoRecheck: false, snapshots: { [source.id]: result.snapshot } })).not.toBeNull();
  });

  it("keeps unread excerpts when the inbox fills and admits overflow after review", () => {
    const source = watched();
    const baseline = applyCheck(null, check(source.id, "ok", [goodParagraph]), [], source).snapshot;
    const texts = Array.from({ length: 7 }, (_, index) =>
      `${goodParagraph} Distinct source update ${index + 1} describes another public hearing.`);
    const first = applyCheck(baseline, check(source.id, "ok", texts.slice(0, 5), "2026-11-14T12:01:00.000Z"), [], source);
    const fullCheck = check(source.id, "ok", texts, "2026-11-14T12:02:00.000Z");
    const overflow = applyCheck(first.snapshot, fullCheck, [], source);
    expect(overflow.status).toBe("new_text");
    expect(overflow.snapshot.lastChangedAt).toBe("2026-11-14T12:01:00.000Z");
    expect(overflow.snapshot.pending.map((item) => item.hash)).toEqual(first.snapshot.pending.map((item) => item.hash));
    expect(overflow.snapshot.seenHashes).not.toContain(fullCheck.paragraphs[5].hash);
    expect(overflow.snapshot.seenHashes).not.toContain(fullCheck.paragraphs[6].hash);

    const repeated = applyCheck(overflow.snapshot,
      { ...fullCheck, fetchedAt: "2026-11-14T12:02:30.000Z" }, [], source);
    expect(repeated.snapshot.lastChangedAt).toBe("2026-11-14T12:01:00.000Z");
    expect(repeated.snapshot.pending.map((item) => item.hash)).toEqual(first.snapshot.pending.map((item) => item.hash));

    const afterReview = { ...repeated.snapshot, pending: repeated.snapshot.pending.slice(1) };
    const admitted = applyCheck(afterReview, { ...fullCheck, fetchedAt: "2026-11-14T12:03:00.000Z" }, [], source);
    expect(admitted.snapshot.pending.map((item) => item.hash)).toEqual([
      ...first.snapshot.pending.slice(1).map((item) => item.hash), fullCheck.paragraphs[5].hash,
    ]);
    expect(admitted.snapshot.seenHashes).toContain(fullCheck.paragraphs[5].hash);
    expect(admitted.snapshot.seenHashes).not.toContain(fullCheck.paragraphs[6].hash);
    expect(admitted.snapshot.lastChangedAt).toBe("2026-11-14T12:03:00.000Z");
  });

  it("prioritizes literal project mentions when new text exceeds inbox space", () => {
    const source = watched();
    const baseline = applyCheck(null, check(source.id, "ok", [goodParagraph]), [], source).snapshot;
    const texts = Array.from({ length: 7 }, (_, index) =>
      `${goodParagraph} Distinct source update ${index + 1} describes another public hearing${index >= 5 ? " in Priority County" : ""}.`);
    const latest = check(source.id, "ok", texts, "2026-11-14T12:01:00.000Z");
    const result = applyCheck(baseline, latest, ["Priority County"], source);
    expect(result.snapshot.pending.map((item) => item.hash)).toEqual([5, 6, 0, 1, 2].map((index) => latest.paragraphs[index].hash));
    expect(result.snapshot.pending.slice(0, 2).map((item) => item.mentions)).toEqual([
      ["Priority County"], ["Priority County"],
    ]);
    expect(result.snapshot.seenHashes).not.toContain(latest.paragraphs[3].hash);
    expect(result.snapshot.seenHashes).not.toContain(latest.paragraphs[4].hash);
  });

  it("accepts valid bounded monitor state and rejects malformed snapshots or response checks", () => {
    const source = watched();
    const { snapshot } = applyCheck(null, check(source.id, "ok", [goodParagraph]), [], source);
    const state: MonitorState = { version: 1, autoRecheck: false, snapshots: { [source.id]: snapshot } };
    expect(parseMonitorState(state)).toEqual(state);
    expect(parseMonitorState({ ...state, version: 2 })).toBeNull();
    expect(parseMonitorState({ ...state, snapshots: { other: snapshot } })).toBeNull();
    expect(parseMonitorState({ ...state, snapshots: { [source.id]: { ...snapshot, url: "javascript:alert(1)" } } })).toBeNull();
    expect(parseMonitorState({ ...state, snapshots: { [source.id]: { ...snapshot, seenHashes: Array(513).fill("aaaaaaaaaaaaaaaa") } } })).toBeNull();
    expect(parseMonitorState({ ...state, snapshots: { [source.id]: { ...snapshot, pending: [{ hash: "bad", text: goodParagraph,
      mentions: [], foundAt: snapshot.lastCheckedAt }] } } })).toBeNull();
    expect(parseSourceCheck(check(source.id, "ok", [goodParagraph]))).not.toBeNull();
    expect(parseSourceCheck({ ...check(source.id, "ok", [goodParagraph]), paragraphs: [{ hash: "bad", text: goodParagraph }] })).toBeNull();
    expect(parseSourceCheck({ ...check(source.id, "unreachable"), paragraphs: [{ hash: "aaaaaaaaaaaaaaaa", text: goodParagraph }] })).toBeNull();
  });
});
