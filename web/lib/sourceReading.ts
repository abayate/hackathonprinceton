import type { SourceCheck } from "./sourceMonitorTypes";

export const CHECK_TERMS = {
  power: ["power", "electric", "electricity", "grid", "substation", "interconnection", "megawatt", "megawatts", "MW", "utility"],
  water: ["water", "aquifer", "gallons", "drought", "cooling", "wastewater", "groundwater"],
  zoning: ["rezoning", "zoning", "hearing", "planning commission", "moratorium", "permit", "permits"],
  opposition: ["opposition", "residents", "protest", "petition", "noise", "lawsuit", "neighbors"],
  policy: ["incentive", "incentives", "tax abatement", "audit", "legislation", "ordinance"],
  land: ["acres", "acreage", "flood", "floodplain", "terrain", "parcel", "parcels", "soil", "wetlands"],
  labor: ["construction", "labor", "labour", "workforce", "contractor", "contractors", "jobs"],
} as const;

export type CheckId = keyof typeof CHECK_TERMS;
export type Passage = {
  checkId: CheckId; sourceId: string; hash: string; text: string; terms: string[]; fetchedAt: string;
};

// Combining marks belong to the surrounding word too (e.g. a decomposed accent).
function termPattern(term: string, flags: "iu" | "giu" = "iu"): RegExp {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])${escaped}(?![\\p{L}\\p{N}\\p{M}])`, flags);
}

// Non-global patterns have no advancing lastIndex, so repeated reads are stable.
const CHECK_PATTERNS = (Object.entries(CHECK_TERMS) as [CheckId, readonly string[]][])
  .map(([checkId, terms]) => ({ checkId, terms: terms.map((term) => ({ term, pattern: termPattern(term) })) }));

export function passagesFor(checks: readonly SourceCheck[], limitPerCheck = 3): Passage[] {
  const limit = Number.isInteger(limitPerCheck) && limitPerCheck >= 0 ? Math.min(limitPerCheck, 12) : 3;
  const seen = new Set<string>();
  const counts = new Map<CheckId, number>();
  return checks.filter((check) => check.outcome === "ok").flatMap((check) => check.paragraphs.flatMap((paragraph) =>
    CHECK_PATTERNS.flatMap(({ checkId, terms }): Passage[] => {
      const identity = JSON.stringify([check.sourceId, paragraph.hash, checkId]);
      if ((counts.get(checkId) ?? 0) >= limit || seen.has(identity)) return [];
      const matched = terms.filter(({ pattern }) => pattern.test(paragraph.text)).map(({ term }) => term);
      if (!matched.length) return [];
      seen.add(identity);
      counts.set(checkId, (counts.get(checkId) ?? 0) + 1);
      return [{ checkId, sourceId: check.sourceId, hash: paragraph.hash, text: paragraph.text,
        terms: matched, fetchedAt: check.fetchedAt }];
    })));
}

export function highlightPassage(text: string, terms: readonly string[]): { text: string; matched: boolean }[] {
  const ranges = terms.filter((term) => term.trim()).flatMap((term) =>
    Array.from(text.matchAll(termPattern(term, "giu")), (match) => ({ start: match.index, end: match.index + match[0].length })))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = ranges.reduce<{ start: number; end: number }[]>((result, range) => {
    const last = result.at(-1);
    if (!last || range.start > last.end) return [...result, range];
    return [...result.slice(0, -1), { start: last.start, end: Math.max(last.end, range.end) }];
  }, []);
  const parts: { text: string; matched: boolean }[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) parts.push({ text: text.slice(cursor, range.start), matched: false });
    parts.push({ text: text.slice(range.start, range.end), matched: true });
    cursor = range.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), matched: false });
  return parts;
}
