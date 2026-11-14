import { extractVisibleText } from "./quoteVerify";
import { parseAsOf } from "./params";
import { publicDay, type Signal } from "./signals";
import type { Site } from "./sites";
import { MONITOR_MAX_PARAGRAPHS, MONITOR_MAX_PENDING, MONITOR_MAX_SEEN, MONITOR_MAX_SNAPSHOTS,
  MONITOR_MAX_SOURCES, MONITOR_MAX_TEXT, type CheckStatus, type MonitorState, type PendingText,
  type SourceCheck, type SourceParagraph, type SourceSnapshot, type WatchedSource } from "./sourceMonitorTypes";

export type { CheckStatus, MonitorState, PendingText, SourceCheck, SourceParagraph, SourceSnapshot,
  WatchedSource } from "./sourceMonitorTypes";

const HASH = /^[a-f0-9]{16}$/;
const SOURCE_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}:[a-f0-9]{16}$/i;
const OUTCOMES = new Set<SourceCheck["outcome"]>(["ok", "unreachable", "not_text"]);

/** Stable non-cryptographic hash for deduplication; never a content-authenticity claim. */
function hashText(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

function safeHttps(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048
    || /[\x00-\x1f\x7f]/.test(value)) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port && host.includes(".")
      && host !== "localhost" && !host.endsWith(".local")
      && !/^\d+(?:\.\d+){3}$/.test(host) && !host.startsWith("[");
  } catch { return false; }
}

/** Project-scoped source list; area context and generic check references are excluded. */
export function watchedSourcesFor(site: Site, signals: Signal[]): WatchedSource[] {
  const records = signals.filter((signal) => signal.scope === "project" && signal.entity_id === site.project_id)
    .map((signal) => ({ kind: "record" as const, url: signal.source_url, label: signal.source_name,
      publishedAt: publicDay(signal) }))
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.url.localeCompare(b.url));
  const possible = [
    { kind: "primary" as const, url: site.primary_source_url, label: site.primary_source_name || "Primary source",
      publishedAt: records.find((record) => record.url === site.primary_source_url)?.publishedAt ?? null },
    { kind: "tracker" as const, url: site.tracker_url, label: "Project tracker",
      publishedAt: records.find((record) => record.url === site.tracker_url)?.publishedAt ?? null },
    ...records,
  ];
  const seen = new Set<string>();
  return possible.flatMap((item): WatchedSource[] => {
    if (!safeHttps(item.url) || seen.has(item.url)) return [];
    if (item.kind === "tracker" && !new URL(item.url).pathname.includes(site.project_id)) return [];
    seen.add(item.url);
    return [{ id: `${site.project_id}:${hashText(item.url)}`, projectId: site.project_id,
      url: item.url, label: item.label, kind: item.kind, publishedAt: item.publishedAt }];
  }).slice(0, MONITOR_MAX_SOURCES);
}

/** Normalize visible paragraphs, hash the full text, then bound the displayed excerpt. */
export function toParagraphs(body: string, contentType: string): SourceParagraph[] {
  const visible = extractVisibleText(body, contentType);
  if (visible === null) return [];
  const seen = new Set<string>();
  const paragraphs: SourceParagraph[] = [];
  for (const part of visible.split(/\n\s*\n+/)) {
    const full = part.replace(/\s+/g, " ").trim();
    if (full.length < 60 || full.includes("\ufffd") || seen.has(full)) continue;
    seen.add(full);
    paragraphs.push({ hash: hashText(full), text: full.slice(0, MONITOR_MAX_TEXT) });
    if (paragraphs.length >= MONITOR_MAX_PARAGRAPHS) break;
  }
  return paragraphs;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const found = Object.keys(value);
  return found.length === keys.length && found.every((key) => keys.includes(key));
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value)
    && !!parseAsOf(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

function paragraph(raw: unknown): raw is SourceParagraph {
  return plainObject(raw) && exactKeys(raw, ["hash", "text"])
    && typeof raw.hash === "string" && HASH.test(raw.hash)
    && typeof raw.text === "string" && raw.text.length >= 60 && raw.text.length <= MONITOR_MAX_TEXT
    && raw.text === raw.text.trim() && !/[\x00-\x1f\x7f]/.test(raw.text);
}

/** Validate the route response before client-side state changes. */
export function parseSourceCheck(raw: unknown): SourceCheck | null {
  if (!plainObject(raw) || !exactKeys(raw, ["sourceId", "fetchedAt", "outcome", "paragraphs"])
    || typeof raw.sourceId !== "string" || !SOURCE_ID.test(raw.sourceId)
    || !timestamp(raw.fetchedAt) || !OUTCOMES.has(raw.outcome as SourceCheck["outcome"])
    || !Array.isArray(raw.paragraphs) || raw.paragraphs.length > MONITOR_MAX_PARAGRAPHS
    || !raw.paragraphs.every(paragraph)
    || new Set(raw.paragraphs.map((item: SourceParagraph) => item.hash)).size !== raw.paragraphs.length
    || (raw.outcome !== "ok" && raw.paragraphs.length > 0)) return null;
  return { sourceId: raw.sourceId, fetchedAt: raw.fetchedAt, outcome: raw.outcome as SourceCheck["outcome"],
    paragraphs: raw.paragraphs.map((item: SourceParagraph) => ({ ...item })) };
}

function mentionedTerms(text: string, terms: string[]): string[] {
  const lower = text.toLocaleLowerCase("en-US");
  return [...new Set(terms.filter((term) => typeof term === "string" && term.trim().length > 0 && term.length <= 100)
    .map((term) => term.trim()))].filter((term) => lower.includes(term.toLocaleLowerCase("en-US"))).slice(0, 10);
}

/** First successful fetch is a baseline; failures preserve the last good view. */
export function applyCheck(prev: SourceSnapshot | null, check: SourceCheck, terms: string[], source: WatchedSource):
  { snapshot: SourceSnapshot; status: CheckStatus } {
  const accepted = parseSourceCheck(check);
  if (!accepted || accepted.sourceId !== source.id || !safeHttps(source.url)
    || (prev !== null && (prev.sourceId !== source.id || prev.url !== source.url))) {
    throw new Error("Invalid source check");
  }
  const base: SourceSnapshot = prev ?? {
    sourceId: source.id, url: source.url, firstCheckedAt: accepted.fetchedAt, lastCheckedAt: accepted.fetchedAt,
    lastOkAt: null, lastChangedAt: null, lastOutcome: accepted.outcome, seenHashes: [], pending: [],
  };
  if (accepted.outcome !== "ok") {
    return { snapshot: { ...base, lastCheckedAt: accepted.fetchedAt, lastOutcome: accepted.outcome,
      seenHashes: [...base.seenHashes], pending: base.pending.map((item) => ({ ...item, mentions: [...item.mentions] })) },
    status: accepted.outcome };
  }
  const known = new Set(base.seenHashes);
  const fresh = accepted.paragraphs.filter((item) => !known.has(item.hash));
  const candidates: PendingText[] = base.lastOkAt === null ? [] : fresh.map((item) => ({ ...item,
    mentions: mentionedTerms(item.text, terms), foundAt: accepted.fetchedAt }));
  const prioritized = [...candidates.filter((item) => item.mentions.length > 0),
    ...candidates.filter((item) => item.mentions.length === 0)];
  const newPending = prioritized.slice(0, MONITOR_MAX_PENDING - base.pending.length);
  const pending = [...base.pending.map((item) => ({ ...item, mentions: [...item.mentions] })), ...newPending];
  // Overflow is not seen yet: it can enter the inbox after the user reviews an older excerpt.
  const recorded = base.lastOkAt === null ? accepted.paragraphs : newPending;
  const observed = [...new Set([...base.seenHashes, ...recorded.map((item) => item.hash)])];
  const pendingHashes = pending.map((item) => item.hash);
  const protectedHashes = new Set(pendingHashes);
  const seenHashes = [...observed.filter((hash) => !protectedHashes.has(hash))
    .slice(-(MONITOR_MAX_SEEN - pendingHashes.length)), ...pendingHashes];
  const status: CheckStatus = base.lastOkAt === null ? "baseline" : fresh.length ? "new_text" : "unchanged";
  return { snapshot: { ...base, lastCheckedAt: accepted.fetchedAt, lastOkAt: accepted.fetchedAt,
    lastChangedAt: newPending.length > 0 ? accepted.fetchedAt : base.lastChangedAt,
    lastOutcome: "ok", seenHashes, pending }, status };
}

function pendingText(raw: unknown, seen: Set<string>): raw is PendingText {
  return plainObject(raw) && exactKeys(raw, ["hash", "text", "mentions", "foundAt"])
    && paragraph({ hash: raw.hash, text: raw.text }) && seen.has(raw.hash as string)
    && Array.isArray(raw.mentions) && raw.mentions.length <= 10
    && raw.mentions.every((term) => typeof term === "string" && term.length > 0 && term.length <= 100
      && term === term.trim() && !/[\x00-\x1f\x7f]/.test(term))
    && new Set(raw.mentions).size === raw.mentions.length && timestamp(raw.foundAt);
}

function snapshot(raw: unknown, id: string): raw is SourceSnapshot {
  if (!plainObject(raw) || !exactKeys(raw, ["sourceId", "url", "firstCheckedAt", "lastCheckedAt",
    "lastOkAt", "lastChangedAt", "lastOutcome", "seenHashes", "pending"])
    || raw.sourceId !== id || !safeHttps(raw.url) || !timestamp(raw.firstCheckedAt)
    || !timestamp(raw.lastCheckedAt) || Date.parse(raw.lastCheckedAt) < Date.parse(raw.firstCheckedAt)
    || (raw.lastOkAt !== null && (!timestamp(raw.lastOkAt) || Date.parse(raw.lastOkAt) > Date.parse(raw.lastCheckedAt)))
    || (raw.lastChangedAt !== null && (!timestamp(raw.lastChangedAt) || raw.lastOkAt === null
      || Date.parse(raw.lastChangedAt) > Date.parse(raw.lastOkAt)))
    || !OUTCOMES.has(raw.lastOutcome as SourceCheck["outcome"])
    || !Array.isArray(raw.seenHashes) || raw.seenHashes.length > MONITOR_MAX_SEEN
    || !raw.seenHashes.every((hash) => typeof hash === "string" && HASH.test(hash))
    || new Set(raw.seenHashes).size !== raw.seenHashes.length
    || !Array.isArray(raw.pending) || raw.pending.length > MONITOR_MAX_PENDING) return false;
  const seen = new Set(raw.seenHashes as string[]);
  return raw.pending.every((item) => pendingText(item, seen))
    && new Set(raw.pending.map((item: PendingText) => item.hash)).size === raw.pending.length
    && (raw.lastOkAt !== null || (raw.seenHashes.length === 0 && raw.pending.length === 0 && raw.lastChangedAt === null));
}

/** Strict bounded parser for the browser's persisted monitor state. */
export function parseMonitorState(raw: unknown): MonitorState | null {
  if (!plainObject(raw) || !exactKeys(raw, ["version", "snapshots", "autoRecheck"])
    || raw.version !== 1 || typeof raw.autoRecheck !== "boolean" || !plainObject(raw.snapshots)
    || Object.keys(raw.snapshots).length > MONITOR_MAX_SNAPSHOTS
    || !Object.entries(raw.snapshots).every(([id, value]) => SOURCE_ID.test(id) && snapshot(value, id))) return null;
  return { version: 1, autoRecheck: raw.autoRecheck,
    snapshots: Object.fromEntries(Object.entries(raw.snapshots).map(([id, value]) => {
      const item = value as SourceSnapshot;
      return [id, { ...item, seenHashes: [...item.seenHashes],
        pending: item.pending.map((p) => ({ ...p, mentions: [...p.mentions] })) }];
    })) };
}
