export type WatchedSource = {
  id: string; projectId: string; url: string; label: string;
  kind: "primary" | "tracker" | "record"; publishedAt: string | null;
};
export type SourceParagraph = { hash: string; text: string };
export type SourceCheck = {
  sourceId: string; fetchedAt: string;
  outcome: "ok" | "unreachable" | "not_text"; paragraphs: SourceParagraph[];
};
export type PendingText = SourceParagraph & { mentions: string[]; foundAt: string };
export type SourceSnapshot = {
  sourceId: string; url: string; firstCheckedAt: string; lastCheckedAt: string;
  lastOkAt: string | null; lastChangedAt: string | null;
  lastOutcome: SourceCheck["outcome"]; seenHashes: string[]; pending: PendingText[];
};
export type MonitorState = { version: 1; snapshots: Record<string, SourceSnapshot>; autoRecheck: boolean };
export type CheckStatus = "baseline" | "unchanged" | "new_text" | "unreachable" | "not_text";
export type SourceCheckResponse = { projectId: string; checks: SourceCheck[] };
export const MONITOR_MAX_SOURCES = 8;
export const MONITOR_MAX_PARAGRAPHS = 120;
export const MONITOR_MAX_TEXT = 600;
export const MONITOR_MAX_PENDING = 5;
export const MONITOR_MAX_SEEN = 512;
export const MONITOR_MAX_SNAPSHOTS = 128;
export const MONITOR_INTERVAL_MS = 30 * 60 * 1000;
export function emptyMonitor(): MonitorState {
  return { version: 1, snapshots: {}, autoRecheck: false };
}
