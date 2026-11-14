import { parseMonitorState } from "./sourceMonitor";
import type { MonitorState } from "./sourceMonitorTypes";

export const MONITOR_KEY = "groundwork.monitor.v1";
export type MonitorStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type MonitorStorageWarning = "storage_unavailable" | "quota_exceeded" | "corrupt"
  | "invalid" | "unsupported_version" | "external_change";
export type MonitorLoad = { state: MonitorState | null; warning: MonitorStorageWarning | null; raw: string | null };
export type MonitorWrite = { ok: true; raw: string | null } | { ok: false; warning: MonitorStorageWarning };

/** Bad or future-version data stays untouched until the user explicitly resets it. */
export function loadMonitor(storage: MonitorStorage | null): MonitorLoad {
  if (!storage) return { state: null, warning: "storage_unavailable", raw: null };
  let value: string | null;
  try { value = storage.getItem(MONITOR_KEY); }
  catch { return { state: null, warning: "storage_unavailable", raw: null }; }
  if (value === null) return { state: null, warning: null, raw: null };
  let raw: unknown;
  try { raw = JSON.parse(value); }
  catch { return { state: null, warning: "corrupt", raw: value }; }
  if (raw && typeof raw === "object" && "version" in raw && raw.version !== 1) {
    return { state: null, warning: "unsupported_version", raw: value };
  }
  const state = parseMonitorState(raw);
  return state ? { state, warning: null, raw: value } : { state: null, warning: "invalid", raw: value };
}

export function saveMonitor(storage: MonitorStorage | null, state: MonitorState, expectedRaw?: string | null): MonitorWrite {
  if (!storage) return { ok: false, warning: "storage_unavailable" };
  const parsed = parseMonitorState(state);
  if (!parsed) return { ok: false, warning: "invalid" };
  try {
    if (expectedRaw !== undefined && storage.getItem(MONITOR_KEY) !== expectedRaw)
      return { ok: false, warning: "external_change" };
    const raw = JSON.stringify(parsed);
    storage.setItem(MONITOR_KEY, raw);
    return { ok: true, raw };
  }
  catch (error) {
    return { ok: false, warning: error && typeof error === "object" && "name" in error
      && error.name === "QuotaExceededError" ? "quota_exceeded" : "storage_unavailable" };
  }
}

export function removeMonitor(storage: MonitorStorage | null, expectedRaw?: string | null): MonitorWrite {
  if (!storage) return { ok: false, warning: "storage_unavailable" };
  try {
    if (expectedRaw !== undefined && storage.getItem(MONITOR_KEY) !== expectedRaw)
      return { ok: false, warning: "external_change" };
    storage.removeItem(MONITOR_KEY);
    return { ok: true, raw: null };
  }
  catch { return { ok: false, warning: "storage_unavailable" }; }
}
