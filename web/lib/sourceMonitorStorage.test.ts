import { describe, expect, it } from "vitest";
import { emptyMonitor, type MonitorState } from "./sourceMonitorTypes";
import { loadMonitor, MONITOR_KEY, removeMonitor, saveMonitor, type MonitorStorage } from "./sourceMonitorStorage";

const projectId = "11111111-1111-4111-8111-111111111111";
const sourceId = `${projectId}:0123456789abcdef`;

function memoryStorage(initial?: string): MonitorStorage & { values: Map<string, string> } {
  const values = new Map<string, string>(initial === undefined ? [] : [[MONITOR_KEY, initial]]);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function monitorState(): MonitorState {
  return { ...emptyMonitor(), snapshots: { [sourceId]: {
    sourceId, url: "https://example.org/project", firstCheckedAt: "2026-11-14T14:00:00.000Z",
    lastCheckedAt: "2026-11-14T14:01:00.000Z", lastOkAt: "2026-11-14T14:01:00.000Z",
    lastChangedAt: null, lastOutcome: "ok", seenHashes: ["0123456789abcdef"], pending: [],
  } } };
}

describe("source monitor browser storage", () => {
  it("round trips validated monitor state under its separate key", () => {
    const storage = memoryStorage();
    const state = monitorState();
    const saved = saveMonitor(storage, state);
    expect(saved).toEqual({ ok: true, raw: storage.values.get(MONITOR_KEY) });
    expect([...storage.values.keys()]).toEqual([MONITOR_KEY]);
    expect(loadMonitor(storage)).toEqual({ state, warning: null, raw: storage.values.get(MONITOR_KEY) });
  });

  it("returns empty when no monitor exists without writing one", () => {
    const storage = memoryStorage();
    expect(loadMonitor(storage)).toEqual({ state: null, warning: null, raw: null });
    expect(storage.values.size).toBe(0);
  });

  it("preserves corrupt, invalid and future-version bytes", () => {
    for (const [raw, warning] of [
      ["{broken", "corrupt"],
      [JSON.stringify({ ...monitorState(), snapshots: { [sourceId]: { ...monitorState().snapshots[sourceId], url: "javascript:bad" } } }), "invalid"],
      [JSON.stringify({ ...monitorState(), version: 2 }), "unsupported_version"],
    ]) {
      const storage = memoryStorage(raw);
      expect(loadMonitor(storage)).toEqual({ state: null, warning, raw });
      expect(storage.values.get(MONITOR_KEY)).toBe(raw);
    }
  });

  it("reports blocked reads, quota writes and removal errors without throwing", () => {
    const blocked: MonitorStorage = {
      getItem: () => { throw new DOMException("Denied", "SecurityError"); },
      setItem: () => { throw new DOMException("Full", "QuotaExceededError"); },
      removeItem: () => { throw new DOMException("Denied", "SecurityError"); },
    };
    expect(loadMonitor(blocked)).toEqual({ state: null, warning: "storage_unavailable", raw: null });
    expect(saveMonitor(blocked, monitorState())).toEqual({ ok: false, warning: "quota_exceeded" });
    expect(removeMonitor(blocked)).toEqual({ ok: false, warning: "storage_unavailable" });
  });

  it("refuses invalid in-memory state and removes only its own key", () => {
    const storage = memoryStorage(JSON.stringify(monitorState()));
    storage.values.set("groundwork.workspace.v1", "keep");
    const invalid = { ...monitorState(), autoRecheck: "yes" } as unknown as MonitorState;
    expect(saveMonitor(storage, invalid)).toEqual({ ok: false, warning: "invalid" });
    expect(removeMonitor(storage)).toEqual({ ok: true, raw: null });
    expect([...storage.values.entries()]).toEqual([["groundwork.workspace.v1", "keep"]]);
  });

  it("refuses a stale tab's save or reset without changing another tab's bytes", () => {
    const original = JSON.stringify(monitorState());
    const storage = memoryStorage(original);
    const tabA = loadMonitor(storage);
    expect(tabA.raw).toBe(original);

    const newer = { ...monitorState(), autoRecheck: true };
    const tabB = saveMonitor(storage, newer, original);
    expect(tabB).toEqual({ ok: true, raw: storage.values.get(MONITOR_KEY) });
    const newerRaw = storage.values.get(MONITOR_KEY);

    expect(saveMonitor(storage, monitorState(), tabA.raw)).toEqual({ ok: false, warning: "external_change" });
    expect(removeMonitor(storage, tabA.raw)).toEqual({ ok: false, warning: "external_change" });
    expect(storage.values.get(MONITOR_KEY)).toBe(newerRaw);
    expect(removeMonitor(storage, newerRaw)).toEqual({ ok: true, raw: null });
  });

  it("treats an expected empty key as a real comparison", () => {
    const storage = memoryStorage();
    expect(loadMonitor(storage).raw).toBeNull();
    expect(saveMonitor(storage, monitorState(), null).ok).toBe(true);
    const otherTabRaw = storage.values.get(MONITOR_KEY);
    expect(saveMonitor(storage, emptyMonitor(), null)).toEqual({ ok: false, warning: "external_change" });
    expect(removeMonitor(storage, null)).toEqual({ ok: false, warning: "external_change" });
    expect(storage.values.get(MONITOR_KEY)).toBe(otherTabRaw);
  });
});
